'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import {
  createBoundSession,
  refreshSessionStatus,
  archiveBoundSession,
  type SessionSummary,
} from '@/lib/session-actions';
import {
  createRequest,
  getRequestDetail,
  type RequestSummary,
} from '@/lib/request-actions';
import {
  sendMessage,
  listSessionEvents,
  type SessionEventData,
  type AgentSummary,
  type EnvironmentSummary,
} from '@/lib/actions';

type StreamEvent = SessionEventData;

const TYPE_OPTIONS = [
  { value: 'new-feature', label: 'New Feature' },
  { value: 'spec-change', label: 'Spec Change' },
  { value: 'refactoring', label: 'Refactoring' },
  { value: 'bugfix', label: 'Bug Fix' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: 'text-gray-500 bg-gray-100',
  'in-progress': 'text-blue-600 bg-blue-100',
  reviewing: 'text-yellow-600 bg-yellow-100',
  completed: 'text-green-600 bg-green-100',
  cancelled: 'text-red-500 bg-red-100',
};

const ROLE_COLORS: Record<string, string> = {
  implementer: 'text-blue-700 bg-blue-50',
  reviewer: 'text-purple-700 bg-purple-50',
  fixer: 'text-orange-700 bg-orange-50',
  explorer: 'text-teal-700 bg-teal-50',
};

interface WorkspaceClientProps {
  owner: string;
  repo: string;
  repositoryId: number;
  initialRequests: RequestSummary[];
  agents: AgentSummary[];
  environments: EnvironmentSummary[];
}

export function WorkspaceClient({
  owner,
  repo,
  repositoryId,
  initialRequests,
  agents,
  environments,
}: WorkspaceClientProps) {
  const repoFullName = `${owner}/${repo}`;

  const [requestsList, setRequestsList] = useState(initialRequests);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [requestSessions, setRequestSessions] = useState<SessionSummary[]>([]);
  const [selectedManagedSessionId, setSelectedManagedSessionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // New request form
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequestType, setNewRequestType] = useState('new-feature');
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestContent, setNewRequestContent] = useState('');

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('implementer');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedEnvId, setSelectedEnvId] = useState('');

  // Chat states
  const [chatMessage, setChatMessage] = useState('');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedRequest = requestsList.find((r) => r.id === selectedRequestId);
  const selectedSession = requestSessions.find(
    (s) => s.managedSessionId === selectedManagedSessionId
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [events]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const connectStream = useCallback(async (managedSessionId: string) => {
    eventSourceRef.current?.close();
    setEvents([]);
    setIsStreaming(true);

    // Load history first
    try {
      const history = await listSessionEvents(managedSessionId, 200);
      setEvents(history);
    } catch (err) {
      console.error('Failed to load session history:', err);
    }

    // Open live stream
    const eventSource = new EventSource(`/api/sessions/${managedSessionId}/stream`);
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

  const handleSelectRequest = useCallback(
    (requestId: number) => {
      setSelectedRequestId(requestId);
      setSelectedManagedSessionId(null);
      setShowNewRequest(false);
      setShowNewSession(false);
      setEvents([]);
      eventSourceRef.current?.close();
      setIsStreaming(false);

      // Load sessions for this request
      startTransition(async () => {
        try {
          const detail = await getRequestDetail(requestId);
          setRequestSessions(detail.sessions);
        } catch (err) {
          console.error('Failed to load request detail:', err);
          setRequestSessions([]);
        }
      });
    },
    [startTransition]
  );

  const handleSelectSession = useCallback(
    (managedSessionId: string) => {
      setSelectedManagedSessionId(managedSessionId);
      setShowNewSession(false);
      void connectStream(managedSessionId);
    },
    [connectStream]
  );

  const handleCreateRequest = () => {
    if (!newRequestTitle.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const newReq = await createRequest(
          repositoryId,
          newRequestType,
          newRequestTitle,
          newRequestContent || null
        );
        setRequestsList((prev) => [newReq, ...prev]);
        setSelectedRequestId(newReq.id);
        setRequestSessions([]);
        setShowNewRequest(false);
        setNewRequestTitle('');
        setNewRequestContent('');
        setNewRequestType('new-feature');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create request');
      }
    });
  };

  const handleCreateSession = () => {
    if (!selectedAgentId || !selectedEnvId || !selectedRequestId) return;
    setError(null);
    startTransition(async () => {
      try {
        const newSession = await createBoundSession({
          requestId: selectedRequestId,
          role: selectedRole as 'implementer' | 'reviewer' | 'fixer' | 'explorer',
          agentId: selectedAgentId,
          environmentId: selectedEnvId,
        });
        setRequestSessions((prev) => [newSession, ...prev]);
        setSelectedManagedSessionId(newSession.managedSessionId);
        setShowNewSession(false);
        setSelectedAgentId('');
        setSelectedEnvId('');
        setSelectedRole('implementer');
        void connectStream(newSession.managedSessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create session');
      }
    });
  };

  const handleRefreshStatus = (sessionDbId: number) => {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await refreshSessionStatus(sessionDbId);
        setRequestSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to refresh status');
      }
    });
  };

  const handleArchiveSession = (sessionDbId: number) => {
    setError(null);
    startTransition(async () => {
      try {
        const updated = await archiveBoundSession(sessionDbId);
        setRequestSessions((prev) =>
          prev.map((s) => (s.id === updated.id ? updated : s))
        );
        if (selectedSession && selectedSession.id === sessionDbId) {
          setSelectedManagedSessionId(null);
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
    if (!selectedManagedSessionId || !chatMessage.trim()) return;
    const msg = chatMessage;
    setError(null);
    startTransition(async () => {
      try {
        await sendMessage(selectedManagedSessionId, msg);
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

  const activeSessions = requestSessions.filter((s) => s.status !== 'archived');

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* Sidebar - Request list */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {repoFullName}
          </h2>
          <button
            onClick={() => {
              setShowNewRequest(true);
              setSelectedRequestId(null);
              setSelectedManagedSessionId(null);
            }}
            className="mt-3 w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            New Request
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {requestsList.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">
              No requests yet. Create one to get started.
            </div>
          ) : (
            requestsList.map((req) => (
              <div
                key={req.id}
                onClick={() => handleSelectRequest(req.id)}
                className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedRequestId === req.id
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-800 truncate">
                  {req.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[req.status] || 'text-gray-500 bg-gray-100'}`}>
                    {req.status}
                  </span>
                  <span className="text-xs text-gray-400 px-1.5 py-0.5 rounded bg-gray-50">
                    {req.type}
                  </span>
                </div>
                <span className="text-xs text-gray-400 mt-1 block">
                  {new Date(req.createdAt).toLocaleDateString('en-CA')}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-h-0">
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

        {showNewRequest ? (
          /* New Request Form */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-md w-full space-y-4 bg-white p-6 rounded-lg border">
              <h3 className="text-lg font-medium">Create New Request</h3>
              <p className="text-sm text-gray-500">
                Repository: {repoFullName}
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={newRequestType}
                  onChange={(e) => setNewRequestType(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={newRequestTitle}
                  onChange={(e) => setNewRequestTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="Enter request title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content (optional)
                </label>
                <textarea
                  value={newRequestContent}
                  onChange={(e) => setNewRequestContent(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md resize-none"
                  rows={4}
                  placeholder="Describe the request..."
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateRequest}
                  disabled={isPending || !newRequestTitle.trim()}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isPending ? 'Creating...' : 'Create Request'}
                </button>
                <button
                  onClick={() => setShowNewRequest(false)}
                  className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : selectedManagedSessionId ? (
          /* Chat area - session selected */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedManagedSessionId(null);
                    setEvents([]);
                    eventSourceRef.current?.close();
                    setIsStreaming(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Back
                </button>
                <span className="text-sm font-medium">
                  {selectedSession?.title}
                </span>
                {selectedSession && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${ROLE_COLORS[selectedSession.role] || ''}`}>
                    {selectedSession.role}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {selectedManagedSessionId}
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
                  onClick={() => void connectStream(selectedManagedSessionId)}
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
        ) : selectedRequestId && selectedRequest ? (
          /* Request detail view */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Request header */}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedRequest.title}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[selectedRequest.status] || ''}`}>
                    {selectedRequest.status}
                  </span>
                  <span className="text-xs text-gray-400 px-2 py-1 rounded bg-gray-50">
                    {selectedRequest.type}
                  </span>
                  <span className="text-xs text-gray-400">
                    Created: {new Date(selectedRequest.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Request content */}
              {selectedRequest.content && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Content</h3>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {selectedRequest.content}
                  </p>
                </div>
              )}

              {/* Sessions section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Sessions ({activeSessions.length})
                  </h3>
                  <button
                    onClick={() => setShowNewSession(true)}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    New Session
                  </button>
                </div>

                {showNewSession && (
                  <div className="bg-white p-4 rounded-lg border mb-4 space-y-3">
                    <h4 className="text-sm font-medium">Create Session</h4>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                      >
                        <option value="implementer">Implementer</option>
                        <option value="reviewer">Reviewer</option>
                        <option value="fixer">Fixer</option>
                        <option value="explorer">Explorer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Agent</label>
                      <select
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
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
                      <label className="block text-xs font-medium text-gray-600 mb-1">Environment</label>
                      <select
                        value={selectedEnvId}
                        onChange={(e) => setSelectedEnvId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-md text-sm"
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
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isPending ? 'Creating...' : 'Create'}
                      </button>
                      <button
                        onClick={() => setShowNewSession(false)}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {activeSessions.length === 0 && !showNewSession ? (
                  <div className="text-sm text-gray-400 text-center py-4">
                    No sessions yet. Create one to start working.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeSessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => handleSelectSession(session.managedSessionId)}
                        className="p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {session.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${ROLE_COLORS[session.role] || ''}`}>
                              {session.role}
                            </span>
                            {session.step && (
                              <span className="text-xs text-gray-500">
                                Step: {session.step}
                              </span>
                            )}
                            <span className={`text-xs ${
                              session.status === 'active'
                                ? 'text-green-600'
                                : session.status === 'waiting'
                                  ? 'text-yellow-600'
                                  : 'text-gray-500'
                            }`}>
                              {session.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefreshStatus(session.id);
                            }}
                            disabled={isPending}
                            className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50"
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
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Default state - nothing selected */
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <p className="text-lg">No request selected</p>
              <p className="text-sm mt-2">
                Create a new request or select an existing one from the sidebar.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
