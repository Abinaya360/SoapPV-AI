export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center font-mono">
        <div className="text-6xl text-primary mb-4">404</div>
        <div className="text-muted-foreground">Page not found</div>
        <a href="/" className="mt-4 inline-block text-primary underline text-sm">← Dashboard</a>
      </div>
    </div>
  );
}
