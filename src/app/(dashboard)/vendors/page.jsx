"use client";
import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Tag, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
// import { vendorService, categoryService } from "@/services/vendor.service";
import { toast } from "sonner";

import { vendorRepository } from "@/services/backend-vendors";
import { categoryRepository } from "@/services/backend-categories";

function VendorDialog({ open, vendor, onClose, onSaved }) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [defaultCategory, setDefaultCategory] = useState(vendor?.defaultCategory ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");

  useEffect(() => {
    setName(vendor?.name ?? "");
    setDefaultCategory(vendor?.defaultCategory ?? "");
    setNotes(vendor?.notes ?? "");
  }, [vendor]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      if (vendor) {
        await vendorRepository.update(vendor.id, {
          name: name.trim(),
          defaultCategory,
          notes,
        });
      } else {
        await vendorRepository.create({
          name: name.trim(),
          defaultCategory,
          notes,
        });
      }

      toast.success(vendor ? "Vendor updated" : "Vendor created");

      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(
        err.message || (vendor ? "Failed to update vendor" : "Failed to create vendor")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{vendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="text-xs">Default Category</Label><Input value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} /></div>
          <div><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [newCategory, setNewCategory] = useState("");

  async function load() {
    const categories = await categoryRepository.getAll({
      is_active: true
    });
    setCategories(categories);
    const vendors = await vendorRepository.getAll({
      is_active: true
    });
    setVendors(vendors);
  }
  useEffect(() => { load(); }, []);

  async function handleDeleteVendor(id) {
    if (!confirm("Delete this vendor?")) return;

    try {
      await vendorRepository.delete(id);

      toast.success("Vendor deleted");
      load();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to delete vendor");
    }
  }

  async function handleAddCategory() {
    if (!newCategory.trim()) return;

    try {
      await categoryRepository.create({
        name: newCategory.trim(),
      });

      setNewCategory("");
      toast.success("Category added");
      load();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to add category");
    }
  }

  async function handleToggleCategory(id, current) {
    try {
      await categoryRepository.update(id, {
        is_active: !current,
      });

      load();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to update category");
    }
  }

  async function handleDeleteCategory(id) {
    if (!confirm("Delete this category?")) return;

    try {
      await categoryRepository.delete(id);

      toast.success("Category deleted");
      load();
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to delete category");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Vendors / Categories" description="Manage vendor list and expense categories" />

      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="categories">
          <TabsList>
            <TabsTrigger value="categories">
              <Tag className="mr-2 h-4 w-4" />
              Categories ({categories.length})
            </TabsTrigger>
            <TabsTrigger value="vendors">
              <Store className="mr-2 h-4 w-4" />
              Vendors ({vendors.length})
            </TabsTrigger>
          </TabsList>

          {/* Categories */}
          <TabsContent value="categories" className="mt-4 space-y-4 max-w-lg">
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name"
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              />
              <Button onClick={handleAddCategory} size="sm" disabled={!newCategory.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className={`text-sm ${!cat.is_active ? "text-muted-foreground line-through" : ""}`}>
                      {cat.name}
                    </span>
                    {!cat.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleToggleCategory(cat.id, cat.is_active)}
                    >
                      {cat.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteCategory(cat.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Vendors */}
          <TabsContent value="vendors" className="mt-4 space-y-4 max-w-lg">
            <Button
              size="sm"
              onClick={() => { setEditingVendor(null); setShowVendorDialog(true); }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Vendor
            </Button>

            {vendors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No vendors yet</p>
            ) : (
              <div className="space-y-2">
                {vendors.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{v.name}</p>
                      {v.defaultCategory && (
                        <p className="text-xs text-muted-foreground">{v.defaultCategory}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => { setEditingVendor(v); setShowVendorDialog(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteVendor(v.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <VendorDialog
        open={showVendorDialog}
        vendor={editingVendor}
        onClose={() => setShowVendorDialog(false)}
        onSaved={load}
      />
    </div>
  );
}
