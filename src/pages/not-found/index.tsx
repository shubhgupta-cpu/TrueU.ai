import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/inbox" className="mt-4 inline-flex min-h-touch items-center text-accent underline">
        Go to the Topic Inbox
      </Link>
    </div>
  );
}
