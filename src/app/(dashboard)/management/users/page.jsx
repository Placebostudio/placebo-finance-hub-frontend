"use client";
import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Users, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { userRepository } from "@/services/backend-users";
import { useOwnerGuard } from "@/hooks/use-owner-guard";
import { getInitials } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_VARIANTS = { owner: "destructive", manager: "default", viewer: "secondary" };
const ROLE_LABELS = { owner: "Owner", manager: "Manager", viewer: "Viewer" };

function UserDialog({ open, user, onClose, onSaved }) {
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
    fullName: "",
    role: "viewer",
  });

  useEffect(() => {
    setForm({
      username: user?.username ?? "",
      password: "",
      email: user?.email ?? "",
      fullName: user?.fullName ?? "",
      role: user?.role ?? "viewer",
    });
  }, [user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ============================================================
  // FRONTEND — UserDialog handleSave
  // ============================================================

  const handleSave = async () => {
    if (!form.fullName.trim() || !form.username.trim()) {
      toast.error(
        "Full name and username are required"
      );
      return;
    }

    if (!form.email.trim()) {
      toast.error(
        "Email is required"
      );
      return;
    }

    if (!user && !form.password) {
      toast.error(
        "Password is required for new users"
      );
      return;
    }

    try {
      const data = {
        username: form.username.trim(),
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        role: form.role,
      };
      // Only send a password when creating
      // or when changing an existing password.
      if (form.password) {
        data.password = form.password;
      }

      if (user) {
        await userRepository.update(
          user.id,
          data
        );
      } else {
        await userRepository.create(
          data
        );
      }

      toast.success(
        user
          ? "User updated"
          : "User created"
      );

      await onSaved();

      onClose();

    } catch (err) {
      console.error(
        "Failed to save user:",
        err
      );

      toast.error(
        err.message ||
        "Failed to save user"
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add User"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Full Name *</Label>
            <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Username *</Label>
            <Input value={form.username} onChange={(e) => set("username", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">
              {user ? "New Password (leave blank to keep)" : "Password *"}
            </Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ManagementUsersPage() {
  const { isAuthenticated, user: currentUser, isOwner } = useOwnerGuard();
  const [users, setUsers] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  async function load() {
    setUsers(await userRepository.getAll());
  }
  useEffect(() => {
    load();
  }, []);

  if (!isAuthenticated) return null;

  if (!isOwner) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="User Management" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <ShieldAlert className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Owner access required</p>
        </div>
      </div>
    );
  }

  function handleDelete(id) {
    if (id === currentUser.id) {
      toast.error("Cannot delete yourself");
      return;
    }
    if (!confirm("Delete this user?")) return;
    userRepository.delete(id);
    toast.success("User deleted");
    load();
  }

  async function handleToggle(id, current) {
    await userRepository.update(id, { is_active: !current });
    toast.success(`User ${current ? "deactivated" : "activated"}`);
    load();
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="User Management"
        description="Manage system users and roles"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingUser(null);
              setShowDialog(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-4 overflow-auto max-w-2xl">
        <Alert>
          <AlertDescription className="text-xs">
            This is frontend-only demo authentication. Credentials are stored in browser localStorage.
            Do not use for production without replacing with a real auth system.
          </AlertDescription>
        </Alert>

        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-sm">No users yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <Card key={u.id} className={!u.is_active ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback>{getInitials(u.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{u.full_name}</p>
                      <Badge
                        variant={ROLE_VARIANTS[u.role] ?? "secondary"}
                        className="text-xs"
                      >
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                      {!u.is_active && (
                        <Badge variant="outline" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {u.username} · {u.email}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleToggle(u.id, u.is_active)}
                    >
                      {u.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditingUser(u);
                        setShowDialog(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {u.id !== currentUser.id && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(u.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <UserDialog
        open={showDialog}
        user={editingUser}
        onClose={() => setShowDialog(false)}
        onSaved={load}
      />
    </div>
  );
}
