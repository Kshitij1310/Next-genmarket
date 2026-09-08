export default function StatCard({ title, value, icon }) {
  return (
    <div className="bg-white p-5 rounded-2xl flex items-center gap-4 border border-gray-200 shadow-sm hover:shadow-md transition">

      {/* Icon */}
      <div className="bg-blue-50 text-blue-600 p-3 rounded-xl flex items-center justify-center">
        {icon}
      </div>

      {/* Text */}
      <div>
        <p className="text-sm text-gray-500">
          {title}
        </p>

        <h2 className="text-xl font-semibold text-gray-900">
          {value}
        </h2>
      </div>

    </div>
  );
}