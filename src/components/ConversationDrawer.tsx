import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Plus, X } from 'lucide-react';
import type { Conversation } from '../lib/conversations';
import { Button } from './Button';

type Props = {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: string;
  disabled: boolean;
  onSelect: (id?: string) => void;
};

export function ConversationDrawer({ open, onClose, conversations, activeId, disabled, onSelect }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  return createPortal(
    <dialog ref={dialogRef} id="conversation-history" className="conversation-drawer" aria-labelledby="conversation-history-title"
      onCancel={onClose}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
          <h2 id="conversation-history-title" className="text-lg font-semibold text-emerald-950">Sejarah sembang</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Tutup sejarah sembang" autoFocus><X className="h-4 w-4" /></Button>
        </div>
        <div className="px-4 pb-4">
          <Button className="w-full justify-center" disabled={disabled} onClick={() => onSelect()}><Plus className="h-4 w-4" />Sembang baharu</Button>
        </div>
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
      </div>
    </dialog>, document.body,
  );
}
