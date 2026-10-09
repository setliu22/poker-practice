import { useEffect, useRef } from "react";
import type { BotProfile } from "../../../packages/shared/src/table";
export function BotProfileDialog({
  profile,
  onClose,
}: {
  profile: BotProfile;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="bot-profile-dialog"
      aria-labelledby="bot-profile-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            ref.current.close();
        }
      }}
    >
      <div className="profile-heading">
        <div>
          <p className="eyebrow">PLAYSTYLE</p>
          <h2 id="bot-profile-title">{profile.name}</h2>
          <p className="profile-style">{profile.style}</p>
        </div>
        <button
          className="secondary"
          onClick={() => ref.current?.close()}
          autoFocus
        >
          Close
        </button>
      </div>
      <p>{profile.summary}</p>
      <h3>What to expect</h3>
      <ul>
        {profile.tendencies.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <div className="profile-study">
        <h3>When reviewing a hand</h3>
        <p>{profile.adjustment}</p>
      </div>
      <p className="quiet">
        These are tendencies, not fixed moves. Every bot mixes its actions and
        sees only its own cards and public information. This profile does not
        reveal its current hand.
      </p>
    </dialog>
  );
}
