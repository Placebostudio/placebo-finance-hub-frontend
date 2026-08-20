"use client";
import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { settingsService } from "@/services/settings.service";
import { APP_CONFIG } from "@/config";
import { toast } from "sonner";

export default function SettingsPage() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(settingsService.get()); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    setSaving(true);
    settingsService.update(form);
    setTimeout(() => {
      setSaving(false);
      toast.success("Settings saved");
    }, 300);
  };

  if (!form) return null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Settings"
        description="Application and company settings"
        actions={
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto max-w-xl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Company Name</Label>
              <Input className="mt-1" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">VAT Number</Label>
              <Input className="mt-1" value={form.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tax Number</Label>
              <Input className="mt-1" value={form.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input className="mt-1" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Accounting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Default Currency</Label>
              <Select value={form.defaultCurrency} onValueChange={(v) => set("defaultCurrency", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APP_CONFIG.supportedCurrencies.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fiscal Year Start (month, 1=Jan)</Label>
              <Input
                type="number"
                min={1}
                max={12}
                className="mt-1 w-24"
                value={form.fiscalYearStart}
                onChange={(e) => set("fiscalYearStart", parseInt(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
