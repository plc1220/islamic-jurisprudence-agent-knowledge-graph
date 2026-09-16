import { MessageSquare, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { Conversation } from '../lib/conversations';
import { Button } from './Button';

type Props = {
  open: boolean;
  onToggle: () => void;
  conversations: Conversation[];
  activeId: string;
  disabled: boolean;
  onSelect: (id?: string) => void;
};

export function ConversationDrawer({ open, onToggle, conversations, activeId, disabled, onSelect }: Props) {
  return (
    <aside id="conversation-history" className={`conversation-drawer ${open ? 'is-open' : 'is-collapsed'}`} aria-label="Sejarah sembang">
      <div className="drawer-controls">
        {open && <h2 className="text-base font-semibold text-emerald-950">Sejarah sembang</h2>}
        <Button variant="ghost" onClick={onToggle} aria-expanded={open} aria-controls="conversation-list" aria-label={open ? 'Kecilkan panel sembang' : 'Buka panel sembang'} title={open ? 'Kecilkan panel sembang' : 'Buka panel sembang'}>
          {open ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </Button>
      </div>
      <div className="drawer-new-chat">
        <Button className="w-full justify-center" disabled={disabled} onClick={() => onSelect()} aria-label="Sembang baharu" title="Sembang baharu"><Plus className="h-4 w-4" />{open && 'Sembang baharu'}</Button>
      </div>
      {open && <div id="conversation-list" className="flex min-h-0 flex-1 flex-col">
        <nav aria-label="Perbualan terdahulu" className="min-h-0 flex-1 overflow-y-auto border-y border-stone-200 px-3 py-3">
          {conversations.length ? <ul className="space-y-1">
            {conversations.map(conversation => <li key={conversation.id}>
              <button type="button" disabled={disabled} aria-current={conversation.id === activeId ? 'true' : undefined}
                onClick={() => onSelect(conversation.id)}
                className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-emerald-700 ${conversation.id === activeId ? 'bg-emerald-100/70 text-emerald-950' : 'text-stone-700 hover:bg-stone-100'}`}>
                <MessageSquare className="mt-1 h-4 w-4 shrink-0" />
                <span className="min-w-0"><span className="line-clamp-2 break-words text-sm font-medium">{conversation.title}</span>
                  <span className="mt-1 block text-xs text-stone-500">{new Date(conversation.updatedAt).toLocaleString('ms-MY')}</span>
                </span>
              </button>
            </li>)}
          </ul> : <p className="p-3 text-sm text-stone-500">Belum ada sejarah sembang.</p>}
        </nav>
        <p className="p-5 text-xs leading-relaxed text-stone-500">Disimpan dalam pelayar ini, tanpa log masuk. Sejarah tidak dikongsi antara peranti dan hilang jika data pelayar dipadam.</p>
      </div>}
    </aside>
  );
}
