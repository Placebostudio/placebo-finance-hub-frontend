import React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn("flex items-center justify-between border-b px-4 sm:px-6 py-4 bg-background", className)}>
      {/* On mobile, pl-10 gives clearance for the hamburger button */}
      <div className="pl-10 lg:pl-0 min-w-0">
        <h1 className="text-xl font-semibold truncate">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0 ml-2">{actions}</div>}
    </div>
  );
}
