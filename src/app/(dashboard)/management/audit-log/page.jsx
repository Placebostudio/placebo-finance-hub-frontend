"use client";
import React, { useEffect, useState } from "react";
import {
  ClipboardList, Search, ChevronDown, ChevronRight, ShieldAlert,
  FileText, Receipt, CreditCard, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { auditService } from "@/services/audit.service";
import { useOwnerGuard } from "@/hooks/use-owner-guard";

const ACTION_LABELS = {
  create:                 { label: "Created",            variant: "success" },
  update:                 { label: "Updated",            variant: "secondary" },
  delete:                 { label: "Deleted",            variant: "destructive" },
  soft_delete_requested:  { label: "Delete Requested",   variant: "warning" },
  restore:                { label: "Restored",           variant: "default" },
  permanent_delete:       { label: "Permanently Deleted", variant: "destructive" },
};

const ENTITY_ICONS = {
  document:   FileText,
  expense:    Receipt,
  statement:  CreditCard,
  user:       Users,
};

function ActionBadge({ action }) {
  const cfg = ACTION_LABELS[action] ?? { label: action, variant: "outline" };
  return <Badge variant={cfg.variant} className="text-xs whitespace-nowrap">{cfg.label}</Badge>;
}

function EntityIcon({ type }) {
  const Icon = ENTITY_ICONS[type] ?? FileText;
  return <Icon className="h-3.5 w-3.5 text-muted-foreground" />;
}

function AuditRow({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.before || entry.after;

  return (
    <>
      <TableRow
        className={hasDiff ? "cursor-pointer hover:bg-muted/40" : ""}
        onClick={hasDiff ? () => setExpanded((p) => !p) : undefined}
      >
        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
          {new Date(entry.timestamp).toLocaleString("en-GB", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}
        </TableCell>
        <TableCell>
          <ActionBadge action={entry.action} />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <EntityIcon type={entry.entityType} />
            <span className="text-xs capitalize">{entry.entityType}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs max-w-[180px] truncate" title={entry.entityName}>
          {entry.entityName}
        </TableCell>
        <TableCell className="text-xs">{entry.actorName ?? "Unknown"}</TableCell>
        <TableCell className="w-8">
          {hasDiff && (
            expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </TableCell>
      </TableRow>
      {expanded && hasDiff && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/20 p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              {entry.before && (
                <div>
                  <p className="font-sans font-medium text-muted-foreground mb-1">Before</p>
                  <pre className="bg-muted rounded p-2 overflow-auto max-h-48 text-xs">
                    {JSON.stringify(entry.before, null, 2)}
                  </pre>
                </div>
              )}
              {entry.after && (
                <div>
                  <p className="font-sans font-medium text-muted-foreground mb-1">After</p>
                  <pre className="bg-muted rounded p-2 overflow-auto max-h-48 text-xs">
                    {JSON.stringify(entry.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function AuditLogPage() {
  const { isAuthenticated, isOwner } = useOwnerGuard();
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  function load() {
    const filters = {};
    if (search)       filters.search     = search;
    if (actionFilter !== "all") filters.action = actionFilter;
    if (entityFilter !== "all") filters.entityType = entityFilter;
    setEntries(auditService.getAll(filters));
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, actionFilter, entityFilter]);

  if (!isAuthenticated) return null;

  if (!isOwner) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Audit Log" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Owner access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Audit Log"
        description="Complete record of all significant system actions"
      />

      <div className="flex-1 p-6 space-y-4 overflow-auto">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actor, entity, action…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="create">Created</SelectItem>
              <SelectItem value="update">Updated</SelectItem>
              <SelectItem value="delete">Deleted (direct)</SelectItem>
              <SelectItem value="soft_delete_requested">Delete Requested</SelectItem>
              <SelectItem value="restore">Restored</SelectItem>
              <SelectItem value="permanent_delete">Permanently Deleted</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="statement">Statement</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>

          {(search || actionFilter !== "all" || entityFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setActionFilter("all");
                setEntityFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <ClipboardList className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">
              {search || actionFilter !== "all" || entityFilter !== "all"
                ? "No audit entries match your filters"
                : "No audit entries yet"}
            </p>
            {!(search || actionFilter !== "all" || entityFilter !== "all") && (
              <p className="text-xs mt-1">
                Actions on documents, expenses, and statements will appear here.
              </p>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Entity</TableHead>
                    <TableHead className="text-xs">Name / ID</TableHead>
                    <TableHead className="text-xs">Actor</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <AuditRow key={entry.id} entry={entry} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
          {(search || actionFilter !== "all" || entityFilter !== "all") && " (filtered)"}
        </p>
      </div>
    </div>
  );
}
