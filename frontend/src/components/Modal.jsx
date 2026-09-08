export default function Modal({ title, children, onClose, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`card max-h-[90dvh] w-full overflow-y-auto p-5 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sharehouse-modal-title"
      >
        {title ? (
          <h2 id="sharehouse-modal-title" className="font-display text-2xl">
            {title}
          </h2>
        ) : null}
        <div className={title ? 'mt-4' : ''}>{children}</div>
      </div>
    </div>
  );
}
