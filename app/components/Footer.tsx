import { Link } from "remix";

export function Footer() {
  return (
    <footer className="mb-2 border-t mx-auto max-w-[36rem] border-t-light-500">
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 py-3 sm:py-2 p-2 justify-between">
        <Link to="/" className="hover:underline flex items-center gap-2">
          <img src="/favicon.svg" alt="stickertrade logo" className="h-4" />
          <h1>stickertrade</h1>
        </Link>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
          <Link to="/roadmap" className="hover:underline">
            <h1>roadmap</h1>
          </Link>
          <Link to="/brand" className="hover:underline">
            <h1>brand</h1>
          </Link>
          <Link to="/dev-logs" className="hover:underline">
            <h1>dev logs</h1>
          </Link>
        </div>
      </div>
    </footer>
  );
}
