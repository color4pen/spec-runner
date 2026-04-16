'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import {
  archiveSession,
  createAgent,
  createEnvironment,
  createSession,
  deleteSession,
  listSessionEvents,
  sendMessage,
  type AgentSummary,
  type EnvironmentSummary,
  type SessionEventData,
  type SessionSummary,
} from '@/lib/actions';

type StreamEvent = SessionEventData;

type Tab = 'agents' | 'environments' | 'sessions' | 'chat';

interface DashboardProps {
  initialAgents: AgentSummary[];
  initialEnvironments: EnvironmentSummary[];
  initialSessions: SessionSummary[];
}

export function Dashboard({
  initialAgents,
  initialEnvironments,
  initialSessions,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('agents');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [agentName, setAgentName] = useState('');
  const [agentSystemPrompt, setAgentSystemPrompt] = useState('');
  const [envName, setEnvName] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedEnvId, setSelectedEnvId] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [mountPath, setMountPath] = useState('');

  // Session filter
  const [showArchived, setShowArchived] = useState(false);

  // Chat states
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const visibleSessions = showArchived
    ? initialSessions
    : initialSessions.filter((s) => !s.archivedAt);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const runAction = useCallback((action: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    });
  }, []);

  const handleCreateAgent = () => {
    if (!agentName.trim()) return;
    runAction(async () => {
      await createAgent({
        name: agentName,
        systemPrompt: agentSystemPrompt || undefined,
      });
      setAgentName('');
      setAgentSystemPrompt('');
    });
  };

  const handleCreateEnvironment = () => {
    if (!envName.trim()) return;
    runAction(async () => {
      await createEnvironment({ name: envName });
      setEnvName('');
    });
  };

  const handleCreateSession = () => {
    if (!selectedAgentId || !selectedEnvId) return;
    runAction(async () => {
      await createSession({
        agentId: selectedAgentId,
        environmentId: selectedEnvId,
        repositoryUrl: repositoryUrl || undefined,
        mountPath: mountPath || undefined,
      });
      setSelectedAgentId('');
      setSelectedEnvId('');
      setRepositoryUrl('');
      setMountPath('');
    });
  };

  const handleArchiveSession = (id: string) => {
    runAction(async () => {
      await archiveSession(id);
      if (selectedSessionId === id) {
        setSelectedSessionId('');
        setEvents([]);
        eventSourceRef.current?.close();
      }
    });
  };

  const handleDeleteSession = (id: string) => {
    runAction(async () => {
      await deleteSession(id);
      if (selectedSessionId === id) {
        setSelectedSessionId('');
        setEvents([]);
        eventSourceRef.current?.close();
      }
    });
  };

  const connectStream = async (sessionId: string) => {
    eventSourceRef.current?.close();
    setEvents([]);
    setSelectedSessionId(sessionId);
    setIsStreaming(true);

    // 1. Load recent history first
    try {
      const history = await listSessionEvents(sessionId, 200);
      setEvents(history);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }

    // 2. Then open live stream
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        setEvents((prev) => {
          // Skip duplicates (history + stream overlap)
          if (data.id && prev.some((e) => e.id === data.id)) {
            return prev;
          }
          return [...prev, data];
        });

        if (
          data.type === 'session.status_terminated' ||
          data.type === 'session.deleted'
        ) {
          eventSource.close();
          setIsStreaming(false);
        }
      } catch {
        console.error('Failed to parse event:', event.data);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setIsStreaming(false);
    };
  };

  const handleSendMessage = () => {
    if (!selectedSessionId || !chatMessage.trim()) return;
    const msg = chatMessage;
    runAction(async () => {
      await sendMessage(selectedSessionId, msg);
      setChatMessage('');
    });
  };

  const renderEvent = (event: StreamEvent, index: number) => {
    const key = event.id || `event-${index}`;

    switch (event.type) {
      case 'user.message':
        return (
          <div key={key} className="bg-blue-100 p-3 rounded-lg mb-2 ml-8">
            <span className="text-xs text-blue-600 font-medium">You</span>
            <p className="text-gray-800">
              {event.content?.map((c) => c.text).join('')}
            </p>
          </div>
        );
      case 'agent.message':
        return (
          <div key={key} className="bg-gray-100 p-3 rounded-lg mb-2 mr-8">
            <span className="text-xs text-gray-600 font-medium">Agent</span>
            <p className="text-gray-800 whitespace-pre-wrap">
              {event.content?.map((c) => c.text).join('')}
            </p>
          </div>
        );
      case 'agent.tool_use':
        return (
          <div
            key={key}
            className="bg-yellow-50 p-2 rounded border border-yellow-200 mb-2 text-sm"
          >
            <span className="font-medium text-yellow-700">
              Tool: {event.name}
            </span>
            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto">
              {JSON.stringify(event.input, null, 2)}
            </pre>
          </div>
        );
      case 'agent.tool_result':
        return (
          <div
            key={key}
            className="bg-green-50 p-2 rounded border border-green-200 mb-2 text-sm"
          >
            <span className="font-medium text-green-700">Tool Result</span>
            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto max-h-32">
              {event.content?.map((c) => c.text).join('').slice(0, 500)}
              {(event.content?.map((c) => c.text).join('').length ?? 0) > 500 &&
                '...'}
            </pre>
          </div>
        );
      case 'session.status_idle':
        return (
          <div
            key={key}
            className="text-center text-xs text-gray-500 my-2 py-1"
          >
            Session idle
            {event.stop_reason?.type === 'end_turn' && ' - Ready for input'}
          </div>
        );
      case 'session.status_running':
        return (
          <div key={key} className="text-center text-xs text-blue-500 my-2 py-1">
            Agent is working...
          </div>
        );
      case 'session.error':
        return (
          <div
            key={key}
            className="bg-red-100 p-2 rounded border border-red-300 mb-2 text-sm text-red-700"
          >
            Error: {event.message}
          </div>
        );
      default:
        return (
          <div key={key} className="text-xs text-gray-400 my-1">
            {event.type}
          </div>
        );
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'agents', label: 'Agents' },
    { id: 'environments', label: 'Environments' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'chat', label: 'Chat' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">SpecRunner</h1>
        <p className="text-sm text-gray-500">
          OpenSpec on Managed Agents - Phase 1 PoC
        </p>
      </header>

      <nav className="bg-white border-b border-gray-200">
        <div className="flex space-x-1 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="p-6">
        {activeTab === 'agents' && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-medium mb-4">Create Agent</h2>
            <div className="space-y-4 bg-white p-4 rounded-lg border">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="My OpenSpec Agent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  System Prompt (optional)
                </label>
                <textarea
                  value={agentSystemPrompt}
                  onChange={(e) => setAgentSystemPrompt(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  placeholder="You are a helpful assistant..."
                />
              </div>
              <button
                onClick={handleCreateAgent}
                disabled={isPending || !agentName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Creating...' : 'Create Agent'}
              </button>
            </div>

            <h2 className="text-lg font-medium mt-8 mb-4">Agents</h2>
            <div className="space-y-2">
              {initialAgents.length === 0 ? (
                <p className="text-gray-500 text-sm">No agents created yet.</p>
              ) : (
                initialAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="bg-white p-3 rounded-lg border flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{agent.name}</p>
                      <p className="text-xs text-gray-500">
                        {agent.id} | {agent.model}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'environments' && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-medium mb-4">Create Environment</h2>
            <div className="space-y-4 bg-white p-4 rounded-lg border">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={envName}
                  onChange={(e) => setEnvName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="openspec-env"
                />
              </div>
              <p className="text-xs text-gray-500">
                Environment will be configured with limited networking and
                @fission-ai/openspec npm package.
              </p>
              <button
                onClick={handleCreateEnvironment}
                disabled={isPending || !envName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Creating...' : 'Create Environment'}
              </button>
            </div>

            <h2 className="text-lg font-medium mt-8 mb-4">Environments</h2>
            <div className="space-y-2">
              {initialEnvironments.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No environments created yet.
                </p>
              ) : (
                initialEnvironments.map((env) => (
                  <div
                    key={env.id}
                    className="bg-white p-3 rounded-lg border flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{env.name}</p>
                      <p className="text-xs text-gray-500">{env.id}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="max-w-2xl">
            <h2 className="text-lg font-medium mb-4">Create Session</h2>
            <div className="space-y-4 bg-white p-4 rounded-lg border">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Select an agent</option>
                  {initialAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Environment
                </label>
                <select
                  value={selectedEnvId}
                  onChange={(e) => setSelectedEnvId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Select an environment</option>
                  {initialEnvironments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Repository URL (optional)
                </label>
                <input
                  type="text"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="https://github.com/owner/repo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mount Path (optional)
                </label>
                <input
                  type="text"
                  value={mountPath}
                  onChange={(e) => setMountPath(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="/workspace/myrepo"
                />
              </div>
              <button
                onClick={handleCreateSession}
                disabled={isPending || !selectedAgentId || !selectedEnvId}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Creating...' : 'Create Session'}
              </button>
            </div>

            <div className="flex justify-between items-center mt-8 mb-4">
              <h2 className="text-lg font-medium">Sessions</h2>
              <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="mr-2"
                />
                Show archived
              </label>
            </div>
            <div className="space-y-2">
              {visibleSessions.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  {showArchived
                    ? 'No sessions found.'
                    : 'No active sessions. Create one above.'}
                </p>
              ) : (
                visibleSessions.map((session) => {
                  const isArchived = !!session.archivedAt;
                  return (
                    <div
                      key={session.id}
                      className={`p-3 rounded-lg border ${
                        isArchived
                          ? 'bg-gray-100 border-gray-200'
                          : 'bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p
                            className={`font-medium text-sm ${
                              isArchived ? 'text-gray-500' : ''
                            }`}
                          >
                            {session.id}
                            {isArchived && (
                              <span className="ml-2 px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                                archived
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            Status:{' '}
                            <span
                              className={
                                session.status === 'running'
                                  ? 'text-green-600'
                                  : session.status === 'idle'
                                    ? 'text-blue-600'
                                    : 'text-gray-600'
                              }
                            >
                              {session.status}
                            </span>
                          </p>
                          {session.repositoryUrl && (
                            <p className="text-xs text-gray-500">
                              Repo: {session.repositoryUrl}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          {!isArchived && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedSessionId(session.id);
                                  void connectStream(session.id);
                                  setActiveTab('chat');
                                }}
                                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                Chat
                              </button>
                              <button
                                onClick={() =>
                                  handleArchiveSession(session.id)
                                }
                                disabled={isPending}
                                className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50"
                              >
                                Archive
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            disabled={isPending}
                            className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="max-w-3xl">
            {!selectedSessionId ? (
              <div className="text-center py-12 text-gray-500">
                <p>Select a session from the Sessions tab to start chatting.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-lg border mb-4">
                  <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
                    <div>
                      <span className="text-sm font-medium">Session:</span>
                      <span className="ml-2 text-sm text-gray-600">
                        {selectedSessionId}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isStreaming && (
                        <span className="text-xs text-green-600 flex items-center">
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
                          Connected
                        </span>
                      )}
                      <button
                        onClick={() => void connectStream(selectedSessionId)}
                        className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                      >
                        Reconnect
                      </button>
                    </div>
                  </div>
                  <div className="h-96 overflow-y-auto p-4">
                    {events.length === 0 ? (
                      <p className="text-gray-400 text-center">
                        No events yet. Send a message to start.
                      </p>
                    ) : (
                      events.map((event, index) => renderEvent(event, index))
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <textarea
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1 px-3 py-2 border rounded-md resize-none"
                    rows={2}
                    placeholder="Type a message... (Shift+Enter for new line)"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isPending || !chatMessage.trim()}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
