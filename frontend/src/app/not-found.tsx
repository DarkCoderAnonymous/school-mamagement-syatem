import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
          <FileQuestion className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground text-sm">
            That page doesn&apos;t exist, or you may not have access to it. Check the address, or head back to
            somewhere familiar.
          </p>
        </div>
        <Link href="/">
          <Button>Go to home</Button>
        </Link>
      </div>
    </main>
  );
}
