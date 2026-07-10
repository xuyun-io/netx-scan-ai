import { Bot, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navigationItems, type WorkspaceView } from '@/data/promptTemplates';
import type { Conversation } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SidebarProps {
  activeView: WorkspaceView;
  activeConversationId?: string;
  conversations: Conversation[];
  onDeleteConversation: (conversation: Conversation) => Promise<void>;
  onNewChat: () => void;
  onOpenConversation: (conversation: Conversation) => void;
  onSelectView: (view: WorkspaceView) => void;
}

export function Sidebar({
  activeView,
  activeConversationId,
  conversations,
  onDeleteConversation,
  onNewChat,
  onOpenConversation,
  onSelectView,
}: SidebarProps) {
  return (
    <aside className="relative flex h-full flex-col border-r border-[#222b36] bg-[#121922] max-lg:hidden">
      <div className="border-b border-[#202936] px-5 pb-7 pt-4">
        <Button className="h-8 w-full border-2 text-[13px]" variant="outline" onClick={onNewChat}>
          <Plus className="h-4 w-4" />
          New chat
        </Button>

        <nav className="mt-6 space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-0.5 py-1 text-left text-sm font-medium transition-colors',
                  active ? 'text-[#8f82ff]' : 'text-[#c3c9d3] hover:text-white',
                )}
                onClick={() => onSelectView(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="px-5 py-4">
        <div className="mb-4 text-sm font-semibold text-[#d9dee8]">Recent</div>
        <div className="space-y-2">
          {conversations.length === 0 && (
            <div className="text-xs font-normal text-[#788291]">No conversations yet</div>
          )}
          {conversations.map((item) => {
            const active = activeConversationId === item.conversationId;
            return (
              <div
                key={item.conversationId}
                className={cn(
                  'group flex items-center justify-between rounded-sm px-1 py-0.5 transition',
                  active ? 'bg-[#1f2937]' : 'hover:bg-[#1f2937]/50',
                )}
              >
                <button
                  className={cn(
                    'min-w-0 flex-1 truncate text-left text-xs font-normal',
                    active ? 'text-[#8f82ff]' : 'text-[#b8bfcc] hover:text-white',
                  )}
                  onClick={() => onOpenConversation(item)}
                >
                  {item.title || '新的会话'}
                </button>
                <button
                  className="ml-1 rounded p-0.5 text-[#64748b] opacity-0 transition hover:bg-[#374151] hover:text-red-400 group-hover:opacity-100"
                  aria-label={`删除 ${item.title || '新的会话'}`}
                  onClick={() => onDeleteConversation(item)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-[#202936] px-5 py-4 text-xs font-normal text-[#aab2bf]">
        <Bot className="h-4 w-4" />
        FileStore
      </div>
    </aside>
  );
}
