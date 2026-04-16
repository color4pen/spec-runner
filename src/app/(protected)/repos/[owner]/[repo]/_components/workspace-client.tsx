'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import {
  createBoundSession,
  refreshSessionStatus,
  archiveBoundSession,
  type UserSessionSummary,
} from '@/lib/session-actions';
import { sendMessage, listSessionEvents, type SessionEventData, type AgentSummary, type EnvironmentSummary } from '@/lib/actions';

type StreamEvent = SessionEventData;

interface WorkspaceClientProps {
  owner: string;
  repo: string;
  initialSessions: UserSessionSummary[];
  agents: AgentSummary[];
  environments: EnvironmentSummary[];
}

export function WorkspaceClient({
  owner,
  repo,
  initialSessions,
  agents,
  environments,
}: WorkspaceClientProps) {
  const repoFullName = `${owner}/${repo}`;

  const [sessions, setSessions] = useState(initialSessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedEnvId, setSelectedEnvId] = useState('');

  // Chat states
  const [chatMessage, setChatMessage] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedSession = sessions.find(
    (s) => s.sessionId === selectedSessionId
  );

  const activeSessions = sessions.filter((s) => s.status !== 'archived');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const connectStream = useCallback(async (sessionId: string) => {
    eventSourceRef.current?.close();
    setEvents([]);
    setIsStreaming(true);

    // Load history first
    try {
      const history = await listSessionEvents(sessionId, 200);
      setEvents(history);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }

    // Open live stream
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        setEvents((prev) => {
          if (data.id && prev.some((e) => e.id === data.id)) return prev;
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
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setSelectedSessionId(sessionId);
      setShowNewSession(false);
      void connectStream(sessionId);
    },
    [connectStream]
  );

  const handleCreateSession = () => {
    if (!selectedAgentId || !selectedEnvId) return;
    setError(null);
    startTransition(async () => {
      try {
        const newSession = await createBoundSession({
          agentId: selectedAgentId,
          environmentId: selectedEnvId,
          repo: repoFullName,
        });
        setSessions((prev) => [newSession, ...prev]);
        setSelectedSessionId(newSession.sessionId);
        setShowNewSession(false);
        setSelectedAgentId('');
        setSelectedEnvId('');
        void connectStream(newSession.sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create session');
      }
    });
  };

  const handleRefreshStatus = (userSessionId: number) => {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await refreshSessionStatus(userSessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh status');
      }
    });
  };

  const handleArchiveSession = (userSessionId: number) => {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await archiveBoundSession(userSessionId);
        setSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );
        if (
          selectedSession &&
          selectedSession.id === userSessionId
        ) {
          setSelectedSessionId(null);
          setEvents([]);
          eventSourceRef.current?.close();
          setIsStreaming(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to archive session');
      }
    });
  };

  const handleSendMessage = () => {
    if (!selectedSessionId || !chatMessage.trim()) return;
    const msg = chatMessage;
    setError(null);
    startTransition(async () => {
      try {
        await sendMessage(selectedSessionId, msg);
        setChatMessage('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
      }
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
          <div key={key} className="bg-yellow-50 p-2 rounded border border-yellow-200 mb-2 text-sm">
            <span className="font-medium text-yellow-700">Tool: {event.name}</span>
            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto">
              {JSON.stringify(event.input, null, 2)}
            </pre>
          </div>
        );
      case 'agent.tool_result':
        return (
          <div key={key} className="bg-green-50 p-2 rounded border border-green-200 mb-2 text-sm">
            <span className="font-medium text-green-700">Tool Result</span>
            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto max-h-32">
              {event.content?.map((c) => c.text).join('').slice(0, 500)}
              {(event.content?.map((c) => c.text).join('').length ?? 0) > 500 && '...'}
            </pre>
          </div>
        );
      case 'session.status_idle':
        return (
          <div key={key} className="text-center text-xs text-gray-500 my-2 py-1">
            Session idle{event.stop_reason?.type === 'end_turn' && ' - Ready for input'}
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
          <div key={key} className="bg-red-100 p-2 rounded border border-red-300 mb-2 text-sm text-red-700">
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

  return (
    <div className="flex flex-1 h-[calc(100vh-57px)]">
      {/* Sidebar */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {owner}/{repo}
          </h2>
          <button
            onClick={() => setShowNewSession(true)}
            className="mt-3 w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            New Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeSessions.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">
              No sessions yet. Create one to get started.
            </div>
          ) : (
            activeSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleSelectSession(session.sessionId)}
                className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSessionId === session.sessionId
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-800 truncate">
                  {session.title}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span
                    className={`text-xs ${
                      session.status === 'running'
                        ? 'text-green-600'
                        : session.status === 'idle'
                          ? 'text-blue-600'
                          : 'text-gray-500'
                    }`}
                  >
                    {session.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRefreshStatus(session.id);
                    }}
                    disabled={isPending}
                    className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50"
                    title="Refresh status"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArchiveSession(session.id);
                    }}
                    disabled={isPending}
                    className="px-2 py-0.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                    title="Archive session"
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col">
        {error && (
          <div className="mx-4 mt-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {showNewSession ? (
          // New Session Form
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full space-y-4 bg-white p-6 rounded-lg border">
              <h3 className="text-lg font-medium">Create New Session</h3>
              <p className="text-sm text-gray-500">
                Repository: {repoFullName}
              </p>
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
                  {agents.map((agent) => (
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
                  {environments.map((env) => (
                    <option key={env.id} value={env.id}>
                      {env.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateSession}
                  disabled={isPending || !selectedAgentId || !selectedEnvId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? 'Creating...' : 'Create Session'}
                </button>
                <button
                  onClick={() => setShowNewSession(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : !selectedSessionId ? (
          // Default state - no session selected (task 5.4)
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg">No session selected</p>
              <p className="text-sm mt-2">
                Create a new session or select an existing one from the sidebar.
              </p>
            </div>
          </div>
        ) : (
          // Chat area (task 5.3)
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
              <div>
                <span className="text-sm font-medium">
                  {selectedSession?.title}
                </span>
                <span className="ml-2 text-xs text-gray-500">
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
            <div className="flex-1 overflow-y-auto p-4">
              {events.length === 0 ? (
                <p className="text-gray-400 text-center">
                  No events yet. Send a message to start.
                </p>
              ) : (
                events.map((event, index) => renderEvent(event, index))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t bg-white">
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
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 self-end"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
