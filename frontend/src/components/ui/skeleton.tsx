import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-shimmer rounded-md bg-muted bg-[linear-gradient(90deg,transparent_25%,color-mix(in_oklch,var(--background)_70%,transparent)_50%,transparent_75%)] bg-size-[200%_100%] bg-no-repeat", className)}
      {...props}
    />
  )
}

export { Skeleton }
