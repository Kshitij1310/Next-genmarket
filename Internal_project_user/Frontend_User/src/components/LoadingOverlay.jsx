export default function LoadingOverlay({ show = false, label = "Loading..." }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[1px] flex items-center justify-center">
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-6 py-4 flex items-center gap-3">
        <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-700">{label}</p>
      </div>
    </div>
  );
}
