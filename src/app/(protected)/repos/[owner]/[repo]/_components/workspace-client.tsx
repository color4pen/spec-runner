'use client';

import { useState, useEffect, useRef, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import {
  startBootstrap,
  cancelBootstrap,
} from '@/lib/bootstrap-actions';
import {
  startPropose,
  getChangeFolderFiles,
  getChangeFolderFileContent,
  getChangeFolderDirectoryContents,
} from '@/lib/propose-actions';
// DirectoryEntry type is imported from github-api.ts because propose-actions.ts ('use server') cannot re-export types to client components.
import type { DirectoryEntry } from '@/lib/github-api';
import type { BootstrapStatus } from '@/lib/bootstrap-utils';

type StreamEvent = SessionEventData;

const TYPE_OPTIONS = [
  { value: 'new-feature', label: 'New Feature' },
  { value: 'spec-change', label: 'Spec Change' },
  { value: 'refactoring', label: 'Refactoring' },
  { value: 'bugfix', label: 'Bug Fix' },
] as const;

const ENABLED_OPTIONS = [
  { value: 'test-case-generator', label: 'Test Case Generator' },
  { value: 'adr', label: 'ADR' },
  { value: 'module-architect', label: 'Module Architect' },
  { value: 'security-reviewer', label: 'Security Reviewer' },
  { value: 'pattern-reviewer', label: 'Pattern Reviewer' },
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
  propose: 'text-indigo-700 bg-indigo-50',
  bootstrap: 'text-gray-700 bg-gray-100',
};

const BOOTSTRAP_STATUS_CONFIG: Record<BootstrapStatus, { label: string; badgeClass: string }> = {
  uninitialized: { label: 'Not bootstrapped', badgeClass: 'bg-gray-100 text-gray-600' },
  bootstrapping: { label: 'Bootstrapping in progress...', badgeClass: 'bg-yellow-100 text-yellow-700 animate-pulse' },
  pr_pending: { label: 'PR pending review', badgeClass: 'bg-blue-100 text-blue-700' },
  ready: { label: 'Ready', badgeClass: 'bg-green-100 text-green-700' },
};

interface WorkspaceClientProps {
  owner: string;
  repo: string;
  repositoryId: number;
  bootstrapStatus: BootstrapStatus;
  bootstrapPrUrl: string | null;
  initialRequests: RequestSummary[];
  agents: AgentSummary[];
  environments: EnvironmentSummary[];
}

export function WorkspaceClient({
  owner,
  repo,
  repositoryId,
  bootstrapStatus: initialBootstrapStatus,
  bootstrapPrUrl,
  initialRequests,
  agents,
  environments,
}: WorkspaceClientProps) {
  const repoFullName = `${owner}/${repo}`;
  const router = useRouter();

  const [requestsList, setRequestsList] = useState(initialRequests);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [requestSessions, setRequestSessions] = useState<SessionSummary[]>([]);
  const [selectedManagedSessionId, setSelectedManagedSessionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(initialBootstrapStatus);

  // New request form
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequestType, setNewRequestType] = useState('new-feature');
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestContent, setNewRequestContent] = useState('');
  const [newRequestEnabled, setNewRequestEnabled] = useState<string[]>([]);

  // New session form
  const [showNewSession, setShowNewSession] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('implementer');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedEnvId, setSelectedEnvId] = useState('');

  // Bootstrap dialog
  const [showBootstrapDialog, setShowBootstrapDialog] = useState(false);
  const [bootstrapAgentId, setBootstrapAgentId] = useState('');
  const [bootstrapEnvId, setBootstrapEnvId] = useState('');
  const [bootstrapPrUrlState, setBootstrapPrUrlState] = useState<string | null>(bootstrapPrUrl);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Propose dialog
  const [showProposeDialog, setShowProposeDialog] = useState(false);
  const [proposeAgentId, setProposeAgentId] = useState('');
  const [proposeEnvId, setProposeEnvId] = useState('');

  // Change folder viewer
  const [showChangeFolderViewer, setShowChangeFolderViewer] = useState(false);
  const [changeFolderFiles, setChangeFolderFiles] = useState<DirectoryEntry[]>([]);
  const [selectedChangeFolderFile, setSelectedChangeFolderFile] = useState<string | null>(null);
  const [changeFolderFileContent, setChangeFolderFileContent] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirChildren, setDirChildren] = useState<Map<string, DirectoryEntry[]>>(new Map());

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

  const isBootstrapped = bootstrapStatus === 'ready';

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [events]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Start polling for bootstrap status after session completion
  const startStatusPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    let pollCount = 0;
    const MAX_POLLS = 30;

    pollingIntervalRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      try {
        const res = await fetch(`/api/repos/${owner}/${repo}/status`);
        if (!res.ok) return;
        const data = await res.json() as {
          bootstrapStatus: string;
          bootstrapPrUrl: string | null;
          requestStatus: string | null;
        };

        if (data.bootstrapStatus !== bootstrapStatus) {
          setBootstrapStatus(data.bootstrapStatus as typeof bootstrapStatus);

          // When transitioning to pr_pending, update PR URL and refresh
          if (data.bootstrapStatus === 'pr_pending' && data.bootstrapPrUrl) {
            setBootstrapPrUrlState(data.bootstrapPrUrl);
            router.refresh();
          }
        }
        if (data.bootstrapPrUrl) {
          setBootstrapPrUrlState(data.bootstrapPrUrl);
        }

        // Stop polling when state stabilizes
        if (
          data.bootstrapStatus === 'pr_pending' ||
          data.bootstrapStatus === 'uninitialized' ||
          data.bootstrapStatus === 'ready'
        ) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  }, [bootstrapStatus, owner, repo, router]);

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

        // When session becomes idle with end_turn, start polling for status update
        if (data.type === 'session.status_idle' && bootstrapStatus === 'bootstrapping') {
          startStatusPolling();
        }

        // When propose session becomes idle, reload sessions to detect completion
        if (data.type === 'session.status_idle' && selectedRequestId) {
          getRequestDetail(selectedRequestId).then((detail) => {
            setRequestSessions(detail.sessions);
          }).catch(() => {
            // Ignore reload errors
          });
        }

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
  }, [bootstrapStatus, startStatusPolling, selectedRequestId]);

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
        const newReq = await createRequest({
          repositoryId,
          type: newRequestType,
          title: newRequestTitle,
          content: newRequestContent || null,
          enabled: newRequestEnabled.length > 0 ? newRequestEnabled : undefined,
        });
        setRequestsList((prev) => [newReq, ...prev]);
        setSelectedRequestId(newReq.id);
        setRequestSessions([]);
        setShowNewRequest(false);
        setNewRequestTitle('');
        setNewRequestContent('');
        setNewRequestType('new-feature');
        setNewRequestEnabled([]);
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

  const handleStartBootstrap = () => {
    if (!bootstrapAgentId || !bootstrapEnvId) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await startBootstrap(repositoryId, bootstrapAgentId, bootstrapEnvId);
        setBootstrapStatus('bootstrapping');
        setShowBootstrapDialog(false);
        setBootstrapAgentId('');
        setBootstrapEnvId('');
        // Navigate to the bootstrap session
        void connectStream(result.managedSessionId);
        setSelectedManagedSessionId(result.managedSessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start bootstrap');
      }
    });
  };

  const handleCancelBootstrap = () => {
    setError(null);
    startTransition(async () => {
      try {
        await cancelBootstrap(repositoryId);
        setBootstrapStatus('uninitialized');
        setBootstrapPrUrlState(null);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to cancel bootstrap');
      }
    });
  };

  const handleStartPropose = () => {
    if (!proposeAgentId || !proposeEnvId || !selectedRequestId) return;
    setError(null);
    startTransition(async () => {
      try {
        await startPropose(selectedRequestId, proposeAgentId, proposeEnvId);
        setShowProposeDialog(false);
        setProposeAgentId('');
        setProposeEnvId('');
        // Reload request sessions to show the new propose session with status badge
        const detail = await getRequestDetail(selectedRequestId);
        setRequestSessions(detail.sessions);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start propose');
      }
    });
  };

  const handleLoadChangeFolderFiles = () => {
    if (!selectedRequestId) return;
    setError(null);
    startTransition(async () => {
      try {
        const files = await getChangeFolderFiles(selectedRequestId);
        setChangeFolderFiles(files);
        setShowChangeFolderViewer(true);
        setSelectedChangeFolderFile(null);
        setChangeFolderFileContent(null);
        setExpandedDirs(new Set());
        setDirChildren(new Map());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load change folder');
      }
    });
  };

  const handleToggleDirectory = (dirPath: string) => {
    if (!selectedRequestId) return;
    // If already expanded, collapse
    if (expandedDirs.has(dirPath)) {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
      return;
    }
    // If already fetched, just expand
    if (dirChildren.has(dirPath)) {
      setExpandedDirs((prev) => new Set(prev).add(dirPath));
      return;
    }
    // Fetch and expand
    setError(null);
    startTransition(async () => {
      try {
        const children = await getChangeFolderDirectoryContents(selectedRequestId, dirPath);
        setDirChildren((prev) => new Map(prev).set(dirPath, children));
        setExpandedDirs((prev) => new Set(prev).add(dirPath));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load directory contents');
      }
    });
  };

  const handleLoadChangeFolderFileContent = (filePath: string) => {
    if (!selectedRequestId) return;
    setError(null);
    startTransition(async () => {
      try {
        setSelectedChangeFolderFile(filePath);
        const content = await getChangeFolderFileContent(selectedRequestId, filePath);
        setChangeFolderFileContent(content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file content');
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
            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(event.input, null, 2)}
            </pre>
          </div>
        );
      case 'agent.tool_result':
        return (
          <div key={key} className="bg-green-50 p-2 rounded border border-green-200 mb-2 text-sm">
            <span className="font-medium text-green-700">Tool Result</span>
            <pre className="text-xs text-gray-600 mt-1 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
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

  const renderFileTree = (entries: DirectoryEntry[], depth: number): React.ReactNode => {
    return (
      <ul className="space-y-0.5">
        {entries.map((entry) => {
          const isDir = entry.type === 'dir';
          const isExpanded = expandedDirs.has(entry.path);
          const children = dirChildren.get(entry.path);
          const indent = depth * 12;

          return (
            <li key={entry.path}>
              {isDir ? (
                <>
                  <button
                    onClick={() => handleToggleDirectory(entry.path)}
                    disabled={isPending}
                    className="w-full text-left text-xs px-2 py-1 rounded truncate text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    style={{ paddingLeft: `${8 + indent}px` }}
                  >
                    <span className="mr-1">{isExpanded ? '▾' : '▸'}</span>
                    {entry.name}/
                  </button>
                  {isExpanded && children && (
                    children.length === 0 ? (
                      <p
                        className="text-xs text-gray-400 italic py-0.5"
                        style={{ paddingLeft: `${20 + indent}px` }}
                      >
                        Empty directory
                      </p>
                    ) : (
                      renderFileTree(children, depth + 1)
                    )
                  )}
                </>
              ) : (
                <button
                  onClick={() => handleLoadChangeFolderFileContent(entry.path)}
                  className={`w-full text-left text-xs px-2 py-1 rounded truncate ${
                    selectedChangeFolderFile === entry.path
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  style={{ paddingLeft: `${8 + indent}px` }}
                >
                  {entry.name}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const activeSessions = requestSessions.filter((s) => s.status !== 'archived');
  const bootstrapConfig = BOOTSTRAP_STATUS_CONFIG[bootstrapStatus];
  const hasProposeSession = requestSessions.some((s) => s.role === 'propose');
  const hasProposeCompleted = requestSessions.some((s) => s.role === 'propose' && s.status === 'completed');

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* Sidebar - Request list */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {repoFullName}
          </h2>

          {/* Bootstrap status badge */}
          <div className="mt-2">
            <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${bootstrapConfig.badgeClass}`}>
              {bootstrapConfig.label}
            </span>
            {bootstrapStatus === 'pr_pending' && bootstrapPrUrlState && (
              <a
                href={bootstrapPrUrlState}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-blue-600 underline hover:text-blue-800"
              >
                View PR
              </a>
            )}
          </div>

          {/* Cancel bootstrap button */}
          {(bootstrapStatus === 'bootstrapping' || bootstrapStatus === 'pr_pending') && (
            <button
              onClick={handleCancelBootstrap}
              disabled={isPending}
              className="mt-2 w-full px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50 transition-colors"
            >
              Cancel Bootstrap
            </button>
          )}

          {isBootstrapped ? (
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
          ) : (
            <div className="mt-3 space-y-2">
              <button
                disabled
                className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-400 rounded-md cursor-not-allowed"
                title="Repository must be bootstrapped before creating requests"
              >
                New Request
              </button>
              {bootstrapStatus === 'uninitialized' && (
                <button
                  onClick={() => setShowBootstrapDialog(true)}
                  className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Bootstrap
                </button>
              )}
              {bootstrapStatus !== 'uninitialized' && (
                <p className="text-xs text-gray-500 text-center">
                  {bootstrapConfig.label}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {requestsList.length === 0 ? (
            <div className="p-4 text-sm text-gray-400 text-center">
              {isBootstrapped
                ? 'No requests yet. Create one to get started.'
                : 'Bootstrap this repository to start creating requests.'}
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
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enabled Options (optional)
                </label>
                <div className="space-y-1">
                  {ENABLED_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        value={opt.value}
                        checked={newRequestEnabled.includes(opt.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewRequestEnabled((prev) => [...prev, opt.value]);
                          } else {
                            setNewRequestEnabled((prev) => prev.filter((v) => v !== opt.value));
                          }
                        }}
                        className="rounded"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
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
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
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

              {/* Propose actions */}
              {isBootstrapped && selectedRequest.status === 'draft' && !hasProposeSession && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowProposeDialog(true)}
                    disabled={isPending}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    Start Propose
                  </button>
                </div>
              )}

              {/* Change folder viewer toggle */}
              {hasProposeCompleted && (
                <div>
                  <button
                    onClick={showChangeFolderViewer ? () => setShowChangeFolderViewer(false) : handleLoadChangeFolderFiles}
                    disabled={isPending}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {showChangeFolderViewer ? 'Hide Change Folder' : 'View Change Folder'}
                  </button>

                  {showChangeFolderViewer && (
                    <div className="mt-4 border rounded-lg overflow-hidden">
                      <div className="flex">
                        {/* File tree sidebar */}
                        <div className="w-56 shrink-0 border-r bg-gray-50 p-3 overflow-y-auto max-h-96">
                          <h4 className="text-xs font-semibold text-gray-600 mb-2">Change Folder</h4>
                          {changeFolderFiles.length === 0 ? (
                            <p className="text-xs text-gray-400">No files found</p>
                          ) : (
                            renderFileTree(changeFolderFiles, 0)
                          )}
                        </div>

                        {/* File content pane */}
                        <div className="flex-1 p-4 min-h-48 max-h-96 overflow-y-auto">
                          {!selectedChangeFolderFile ? (
                            <p className="text-sm text-gray-400">Select a file to view its content</p>
                          ) : changeFolderFileContent === null ? (
                            <p className="text-sm text-gray-400">Loading...</p>
                          ) : (
                            <pre className="text-xs text-gray-800 whitespace-pre-wrap break-words">
                              {changeFolderFileContent}
                            </pre>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sessions section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Sessions ({activeSessions.length})
                  </h3>
                  {isBootstrapped ? (
                    <button
                      onClick={() => setShowNewSession(true)}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      New Session
                    </button>
                  ) : (
                    <button
                      disabled
                      className="px-3 py-1.5 text-sm bg-gray-100 text-gray-400 rounded-md cursor-not-allowed"
                      title="Repository must be bootstrapped"
                    >
                      New Session
                    </button>
                  )}
                </div>

                {!isBootstrapped && (
                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    This repository needs to be bootstrapped before sessions can be created.
                    {bootstrapStatus === 'uninitialized' && (
                      <button
                        onClick={() => setShowBootstrapDialog(true)}
                        className="ml-2 underline hover:text-yellow-900"
                      >
                        Start Bootstrap
                      </button>
                    )}
                  </div>
                )}

                {showNewSession && isBootstrapped && (
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
              {isBootstrapped ? (
                <>
                  <p className="text-lg">No request selected</p>
                  <p className="text-sm mt-2">
                    Create a new request or select an existing one from the sidebar.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg">Repository not bootstrapped</p>
                  <p className="text-sm mt-2">
                    Bootstrap this repository to enable SpecRunner workflows.
                  </p>
                  {bootstrapStatus === 'uninitialized' && (
                    <button
                      onClick={() => setShowBootstrapDialog(true)}
                      className="mt-4 px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                    >
                      Start Bootstrap
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bootstrap Confirmation Dialog */}
      {showBootstrapDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBootstrapDialog(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Bootstrap Repository
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This will start an automated agent session to initialize openspec-workflow for{' '}
              <strong>{repoFullName}</strong>. The agent will:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside mb-4 space-y-1">
              <li>Run <code>openspec init</code></li>
              <li>Create the directory structure</li>
              <li>Detect the tech stack and verification commands</li>
              <li>Place review-standards.md</li>
              <li>Create a PR with the changes</li>
            </ul>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
                <select
                  value={bootstrapAgentId}
                  onChange={(e) => setBootstrapAgentId(e.target.value)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                <select
                  value={bootstrapEnvId}
                  onChange={(e) => setBootstrapEnvId(e.target.value)}
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
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleStartBootstrap}
                disabled={isPending || !bootstrapAgentId || !bootstrapEnvId}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {isPending ? 'Starting...' : 'Start Bootstrap'}
              </button>
              <button
                onClick={() => {
                  setShowBootstrapDialog(false);
                  setBootstrapAgentId('');
                  setBootstrapEnvId('');
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Propose Dialog */}
      {showProposeDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowProposeDialog(false);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Start Propose Session
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This will start a propose agent session to generate the change folder for{' '}
              <strong>{selectedRequest?.title}</strong>.
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
                <select
                  value={proposeAgentId}
                  onChange={(e) => setProposeAgentId(e.target.value)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                <select
                  value={proposeEnvId}
                  onChange={(e) => setProposeEnvId(e.target.value)}
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
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleStartPropose}
                disabled={isPending || !proposeAgentId || !proposeEnvId}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {isPending ? 'Starting...' : 'Start Propose'}
              </button>
              <button
                onClick={() => {
                  setShowProposeDialog(false);
                  setProposeAgentId('');
                  setProposeEnvId('');
                }}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
