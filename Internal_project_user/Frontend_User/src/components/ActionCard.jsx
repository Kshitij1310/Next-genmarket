export default function ActionCard({ icon, title, description }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4 hover:shadow-md transition cursor-pointer">

      {/* Icon */}
      <div className="bg-blue-50 text-blue-600 p-3 rounded-xl flex items-center justify-center">
        {icon}
      </div>

      {/* Text */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          {title}
        </h3>

        <p className="text-xs text-gray-500">
          {description}
        </p>
      </div>

    </div>
  );
}