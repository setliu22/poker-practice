import { useEffect, useRef, type ReactNode } from "react";
export function StudyDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="study-dialog"
      aria-label={title}
      onClose={onClose}
    >
      <header className="study-dialog-heading">
        <h2>{title}</h2>
        <button
          className="secondary"
          autoFocus
          onClick={() => ref.current?.close()}
        >
          Close
        </button>
      </header>
      <div className="study-dialog-body">{children}</div>
    </dialog>
  );
}
