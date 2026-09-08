import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService.js';
import { inventoryService } from '../../services/inventoryService.js';
import PageContainer from '../../components/common/PageContainer';

const THEMES = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const DENSITIES = [
  { label: 'Comfortable', value: 'comfortable' },
  { label: 'Compact', value: 'compact' },
];


// simple toggle switch using tailwind peer utilities
const Toggle = ({ label, name, checked, onChange }) => (
  <label className="flex items-center cursor-pointer">
    <div className="relative">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-slate-300 rounded-full peer-checked:bg-blue-600 peer-focus:ring-2 peer-focus:ring-blue-300 transition"></div>
      <div className="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full peer-checked:translate-x-5 transition" />
    </div>
    <span className="ml-3 text-sm font-medium text-slate-900">{label}</span>
  </label>
);

const Settings = () => {
  // combined state loaded from GET /api/profile
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    // profile
    name: '',
    email: '',
    role: '',
    customer_id: '',
    // appearance
    theme: 'system',
    density: 'comfortable',
    // preferences
    default_warehouse: '',
    enable_ai_reorder: false,
    enable_notifications: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    fetchWarehouses();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await adminService.getProfile();
      if (!data) throw new Error('Empty response');
      setSettings(data);

      // support both root-level and nested appearance object
      const themeValue =
        data.theme ?? data.appearance?.theme ?? 'system';
      const densityValue =
        data.density ?? data.appearance?.density ?? 'comfortable';

      setForm({
        name: data.name || '',
        email: data.email || '',
        role: data.role || '',
        customer_id: data.customer_id || '',
        theme: themeValue,
        density: densityValue,
        default_warehouse: data.default_warehouse || '',
        enable_ai_reorder: Boolean(data.enable_ai_reorder),
        enable_notifications: Boolean(data.enable_notifications),
      });
    } catch (error) {
      toast.error(error?.message || 'Unable to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      setWarehousesLoading(true);
      const { list } = await inventoryService.getWarehouses();
      setWarehouses(Array.isArray(list) ? list : []);
    } catch (error) {
      // Warehouses optional for settings; log toast only if critical
      toast.error(error?.message || 'Unable to load warehouses');
    } finally {
      setWarehousesLoading(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const hasChanges = useMemo(() => {
    if (!settings) return false;
    const currentTheme = settings.theme ?? settings.appearance?.theme ?? 'system';
    const currentDensity =
      settings.density ?? settings.appearance?.density ?? 'comfortable';
    return (
      form.name !== (settings.name || '') ||
      form.theme !== currentTheme ||
      form.density !== currentDensity ||
      form.default_warehouse !== (settings.default_warehouse || '') ||
      form.enable_ai_reorder !== Boolean(settings.enable_ai_reorder) ||
      form.enable_notifications !== Boolean(settings.enable_notifications)
    );
  }, [form, settings]);

  const handleSaveAll = async () => {
    if (!hasChanges) {
      toast('No changes to save');
      return;
    }
    const payload = {
      name: form.name,
      theme: form.theme,
      density: form.density,
      default_warehouse: form.default_warehouse,
      enable_ai_reorder: form.enable_ai_reorder,
      enable_notifications: form.enable_notifications,
    };

    try {
      setSaving(true);
      await adminService.updateProfile(payload);
      toast.success('Settings updated successfully');
      // refresh everything from server to keep sync
      await loadSettings();
    } catch (error) {
      toast.error(error?.message || 'Unable to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer className="bg-slate-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admin Settings</h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage profile, appearance and operational preferences.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading settings…</div>
        ) : (
          <>
            {/* profile */}
            <section className="bg-white rounded-xl shadow-xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
                <p className="text-sm text-slate-500">
                  Your account information. Email, role and customer ID are read‑only.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-500">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleInputChange}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    disabled
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-500">Role</label>
                  <div className="mt-2 inline-block bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full">
                    {form.role || '-'}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-500">Customer ID</label>
                  <input
                    type="text"
                    name="customer_id"
                    value={form.customer_id}
                    disabled
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                  />
                </div>
              </div>
            </section>

            {/* appearance */}
            <section className="bg-white rounded-xl shadow-xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Appearance</h2>
                <p className="text-sm text-slate-500">
                  Personalize the admin workspace look and feel.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-500">Theme</label>
                  <select
                    name="theme"
                    value={form.theme}
                    onChange={handleInputChange}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {THEMES.map((th) => (
                      <option key={th.value} value={th.value}>
                        {th.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-slate-500">Density</label>
                  <select
                    name="density"
                    value={form.density}
                    onChange={handleInputChange}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {DENSITIES.map((den) => (
                      <option key={den.value} value={den.value}>
                        {den.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* preferences */}
            <section className="bg-white rounded-xl shadow-xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Preferences</h2>
                <p className="text-sm text-slate-500">
                  Defaults for warehouse operations and automation.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-500">Default Warehouse</label>
                  <select
                    name="default_warehouse"
                    value={form.default_warehouse}
                    onChange={handleInputChange}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    disabled={warehousesLoading}
                  >
                    <option value="">Select warehouse</option>
                    {warehouses.map((wh) => (
                      <option
                        key={wh?.warehouse_code || wh?.code}
                        value={wh?.warehouse_code || wh?.code}
                      >
                        {(wh?.warehouse_code || wh?.code || '').toUpperCase()} — {wh?.warehouse_name || wh?.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4">
                  <Toggle
                    label="Enable AI Reorder"
                    name="enable_ai_reorder"
                    checked={form.enable_ai_reorder}
                    onChange={handleInputChange}
                  />
                  <Toggle
                    label="Enable Notifications"
                    name="enable_notifications"
                    checked={form.enable_notifications}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
};

export default Settings;