import { useEffect, useState } from 'react';
import { AgentsAdminPage } from '@/components/admin/agent/agents-admin-page';
import { useAgentAdmin } from '@/components/admin/agent/use-agent-admin';
import { AgentWorkspacePanel } from '@/components/agent-workspace/workspace-panel';
import { LoginPage } from '@/components/auth/login-page';
import { AgentComposer } from '@/components/chat/agent-composer';
import { UploadContextDialog } from '@/components/context-files/upload-dialog';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useWorkspaceActions } from '@/hooks/use-workspace-actions';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useWorkspaceRoute } from '@/hooks/use-workspace-route';
import { checkAuth, login, logout } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { type WorkspaceView } from '@/data/promptTemplates';

function App() {
  const workspaceRoute = useWorkspaceRoute();
  const {
    activeView,
    createMode,
    resourceView,
    viewingAutomationId,
    viewingArtifactId,
    viewingTaskId,
    isChatRoute,
  } = workspaceRoute;
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'required' | 'authenticated'>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const {
    adminView,
    agentSpace,
    agentSpaces,
    handleCreateAgent,
    handleDeleteAgent,
    handleOpenAdmin,
    handleUpdateAgent,
    loadAgentSpaceFromPath,
    loadAgentSpaces,
    openAgent,
  } = useAgentAdmin({
    onBusyChange: setBusy,
    onError: setError,
  });

  const {
    artifactDetail,
    artifacts,
    automationDetail,
    automations,
    documents,
    loadArtifactDetail,
    loadAutomationDetail,
    loadTaskDetail,
    refresh,
    selectedArtifactId,
    selectedAutomationId,
    selectedTaskId,
    setAutomationDetail,
    setAutomations,
    setSelectedArtifactId,
    setSelectedAutomationId,
    setSelectedTaskId,
    taskDetail,
    tasks,
  } = useWorkspaceData({
    activeView,
    agentSpaceName: agentSpace?.name,
    viewingAutomationId,
    viewingArtifactId,
    viewingTaskId,
    onError: setError,
  });

  const {
    chatEvents,
    closeInlineChat,
    conversation,
    conversations,
    handleApproveTask,
    handleDeleteConversation,
    handleNewChat,
    handleOpenConversation,
    handleSend,
    initializeConversations,
    inlineChatOpen,
    openFullChat,
    prompt,
    setPrompt,
  } = useAgentChat({
    activeView,
    agentSpaceName: agentSpace?.name,
    busy,
    onBusyChange: setBusy,
    onError: setError,
    onOpenFullChat: workspaceRoute.openFullChat,
    onRefreshWorkspace: refresh,
    onSelectView: workspaceRoute.selectView,
  });

  const {
    cancelCreate,
    clearHighlightTask,
    closeArtifactDetail,
    closeAutomationDetail,
    closeTaskDetail,
    downloadArtifact,
    expandWorkspace,
    handleCancelTask,
    handleCreateAutomation,
    handleCreateTask,
    handleDeleteArtifact,
    handleDeleteAutomation,
    handleDeleteTask,
    handleDocumentUploaded,
    handlePrimaryAction,
    handleToggleAutomationEnabled,
    handleTriggerAutomation,
    handleUpdateAutomation,
    highlightTaskId,
    openArtifactDetail,
    openAutomationDetail,
    openTaskDetail,
    openTaskFromArtifact,
    refreshWorkspace,
    setUploadOpen,
    startCreate,
    uploadOpen,
  } = useWorkspaceActions({
    agentSpaceName: agentSpace?.name,
    closeInlineChat,
    loadArtifactDetail,
    loadAutomationDetail,
    loadTaskDetail,
    onBusyChange: setBusy,
    onError: setError,
    refresh,
    routes: {
      cancelCreate: workspaceRoute.cancelCreate,
      closeArtifactDetail: workspaceRoute.closeArtifactDetail,
      closeAutomationDetail: workspaceRoute.closeAutomationDetail,
      closeTaskDetail: workspaceRoute.closeTaskDetail,
      openArtifactDetail: workspaceRoute.openArtifactDetail,
      openAutomationDetail: workspaceRoute.openAutomationDetail,
      openTaskDetail: workspaceRoute.openTaskDetail,
      openTasks: workspaceRoute.openTasks,
      startCreate: workspaceRoute.startCreate,
    },
    selectedArtifactId,
    selectedTaskId,
    setAutomationDetail,
    setAutomations,
    setSelectedArtifactId,
    setSelectedAutomationId,
    setSelectedTaskId,
    viewingArtifactId,
    viewingAutomationId,
    viewingTaskId,
  });

  const isFullChat = activeView === 'chat';
  const hasInlineChat = !isFullChat && inlineChatOpen;

  useEffect(() => {
    let alive = true;
    const verifyAuth = async () => {
      try {
        const result = await checkAuth();
        if (!alive) return;
        if (result.authenticated || !result.authEnabled) {
          setAuthStatus('authenticated');
        } else {
          setAuthStatus('required');
        }
      } catch {
        if (alive) setAuthStatus('required');
      }
    };
    verifyAuth();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let alive = true;
    const bootstrap = async () => {
      try {
        await loadAgentSpaces();
        if (!alive) return;
        const nextAgentSpace = await loadAgentSpaceFromPath();
        if (nextAgentSpace) {
          await initializeConversations(nextAgentSpace.name, { createIfEmpty: isChatRoute() });
          if (!alive) return;
          await refresh(nextAgentSpace.name);
        }
      } catch (err) {
        if (alive) {
          const message = (err as Error).message;
          if (message.toLowerCase().includes('unauthorized')) {
            logout();
            setAuthStatus('required');
          } else {
            setError(message);
          }
        }
      } finally {
        if (alive) setBooting(false);
      }
    };
    bootstrap();
    return () => {
      alive = false;
    };
  }, [authStatus, initializeConversations, isChatRoute, loadAgentSpaceFromPath, loadAgentSpaces, refresh]);

  const handleLogin = async (username: string, password: string) => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await login(username, password);
      if (result.authenticated) {
        setAuthStatus('authenticated');
        setBooting(true);
      } else {
        setAuthError('登录失败，请检查用户名和密码');
      }
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    setAuthStatus('required');
    setAuthError(null);
  };

  const selectView = (view: WorkspaceView) => {
    closeInlineChat();
    workspaceRoute.selectView(view);
  };

  if (authStatus === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111821]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3a4654] border-t-[#70c4d5]" />
      </div>
    );
  }

  if (authStatus === 'required') {
    return <LoginPage error={authError} loading={authLoading} onLogin={handleLogin} />;
  }

  if (adminView || !agentSpace) {
    return (
      <AgentsAdminPage
        agentSpaces={agentSpaces}
        booting={booting}
        busy={busy}
        error={error}
        onCreateAgent={handleCreateAgent}
        onDeleteAgent={handleDeleteAgent}
        onOpenAgent={openAgent}
        onUpdateAgent={handleUpdateAgent}
        onRefresh={loadAgentSpaces}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#111821] text-[#d8dee9]">
      <div className="h-[2px] bg-[#70c4d5]" />
      <TopBar agentSpaceName={agentSpace.name} onOpenAdmin={handleOpenAdmin} onLogout={handleLogout} />
      <div className="grid h-[calc(100vh-46px)] grid-cols-[190px_minmax(0,1fr)] max-lg:grid-cols-1">
        <Sidebar
          activeView={activeView}
          activeConversationId={conversation?.conversationId}
          conversations={conversations}
          onDeleteConversation={handleDeleteConversation}
          onNewChat={handleNewChat}
          onOpenConversation={handleOpenConversation}
          onSelectView={selectView}
        />

        <main
          className={cn(
            'min-w-0 overflow-hidden bg-[#111821]',
            isFullChat
              ? 'h-full'
              : hasInlineChat
                ? 'grid h-full grid-cols-[minmax(450px,520px)_minmax(0,1fr)] max-xl:grid-cols-[430px_minmax(0,1fr)] max-lg:grid-cols-1'
                : 'h-full',
          )}
        >
          {isFullChat && (
            <AgentComposer
              booting={booting}
              busy={busy}
              conversationTitle={conversation?.title || '新的会话'}
              events={chatEvents}
              prompt={prompt}
              variant="full"
              onApproveTask={handleApproveTask}
              onPromptChange={setPrompt}
              onSend={handleSend}
              onTemplateClick={setPrompt}
            />
          )}

          {hasInlineChat && (
            <AgentComposer
              booting={booting}
              busy={busy}
              conversationTitle={conversation?.title || '新的会话'}
              events={chatEvents}
              prompt={prompt}
              variant="inline"
              onApproveTask={handleApproveTask}
              onExpand={openFullChat}
              onPromptChange={setPrompt}
              onSend={handleSend}
              onTemplateClick={setPrompt}
            />
          )}

          {!isFullChat && (
            <AgentWorkspacePanel
              automations={automations}
              automationDetail={automationDetail}
              artifacts={artifacts}
              artifactDetail={artifactDetail}
              busy={busy}
              createMode={createMode}
              documents={documents}
              error={error}
              highlightTaskId={highlightTaskId}
              selectedAutomationId={selectedAutomationId}
              selectedArtifactId={selectedArtifactId}
              tasks={tasks}
              viewingAutomationId={viewingAutomationId}
              viewingArtifactId={viewingArtifactId}
              view={resourceView}
              onApproveTask={handleApproveTask}
              onCancelCreate={cancelCreate}
              onCancelTask={handleCancelTask}
              onClearHighlightTask={clearHighlightTask}
              onCloseAutomationDetail={closeAutomationDetail}
              onCloseArtifactDetail={closeArtifactDetail}
              onCreate={startCreate}
              onCreateAutomation={handleCreateAutomation}
              onCreateTask={handleCreateTask}
              onDeleteArtifact={handleDeleteArtifact}
              onDownloadArtifact={downloadArtifact}
              onDeleteTask={handleDeleteTask}
              onExpandWorkspace={expandWorkspace}
              onOpenAutomationDetail={openAutomationDetail}
              onOpenArtifactDetail={openArtifactDetail}
              onOpenTaskDetail={openTaskDetail}
              onOpenTaskFromArtifact={openTaskFromArtifact}
              onPrimaryAction={handlePrimaryAction}
              onRefresh={refreshWorkspace}
              onToggleAutomationEnabled={handleToggleAutomationEnabled}
              onDeleteAutomation={handleDeleteAutomation}
              onTriggerAutomation={handleTriggerAutomation}
              onUpdateAutomation={handleUpdateAutomation}
              setSelectedAutomationId={setSelectedAutomationId}
              selectedTaskId={selectedTaskId}
              setSelectedTaskId={setSelectedTaskId}
              taskDetail={taskDetail}
              viewingTaskId={viewingTaskId}
              onCloseTaskDetail={closeTaskDetail}
            />
          )}
        </main>
      </div>

      {error && isFullChat && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-red-400/30 bg-red-950/80 px-4 py-2 text-sm text-red-100">
          {error}
        </div>
      )}
      <UploadContextDialog
        busy={busy}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleDocumentUploaded}
      />
    </div>
  );
}


export default App;
