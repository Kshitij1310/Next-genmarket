import { useProducts } from "@/hooks/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data, isLoading, isError, error } = useProducts({ page: 1, pageSize: 6 });
  const products = data?.items || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>

      <Card className="mb-8 max-w-sm rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-gray-500">
            Total Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-gray-900">{products.length}</p>
        </CardContent>
      </Card>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Products</h2>

      {isError ? (
        <p className="text-red-600">{error?.message || "Failed to load products."}</p>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {products.map((product) => (
            <Card
              key={product.sku}
              className="rounded-2xl p-5 shadow-sm transition hover:shadow-md"
            >
              <h3 className="text-gray-900 font-semibold">{product.name}</h3>
              <p className="text-xs text-gray-500 mt-1">SKU: {product.sku}</p>
              <p className="text-sm text-blue-600 font-medium mt-3">
                {product.currency} {product.price}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
