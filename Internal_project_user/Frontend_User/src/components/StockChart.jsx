import { TrendingUp } from "lucide-react";

export default function StockChart() {
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">

      {/* Header */}
      <div className="flex justify-between items-center">

        {/* Title */}
        <div className="flex items-center gap-3">

          <div className="bg-blue-50 text-blue-600 p-2 rounded-lg flex items-center justify-center">
            <TrendingUp size={16} />
          </div>

          <h2 className="text-sm font-semibold text-gray-900">
            Stock by Warehouse
          </h2>

        </div>

        {/* Action */}
        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium transition">
          View All →
        </button>

      </div>

    </div>
  );
}