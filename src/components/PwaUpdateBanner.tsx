import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 text-white p-3 flex items-center justify-between gap-3 shadow-lg">
      <span className="text-sm">A new version is available.</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => updateServiceWorker(true)}
          className="text-sm font-medium bg-white text-slate-900 px-3 py-1 rounded hover:bg-slate-100 transition-colors"
        >
          Update Now
        </button>
        <button
          onClick={() => updateServiceWorker(false)}
          className="text-sm text-white/60 hover:text-white transition-colors px-2 py-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
