import { useMemo, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Lock,
  Moon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProfile, useUpdateProfile } from "@/hooks/queries";
import { useUiStore } from "@/store/uiStore";

export default function Settings() {

  const navigate = useNavigate();

  const { data: profileData, error: profileError } = useProfile();

  // The server response is the profile; only the edit form needs local state.
  const profile = useMemo(
    () => ({
      full_name: profileData?.full_name || profileData?.name || "",
      email: profileData?.email || "",
      phone: profileData?.phone || "",
    }),
    [profileData],
  );

  const [formData, setFormData] = useState({ full_name: "", phone: "" });
  const updateProfile = useUpdateProfile();
  const saving = updateProfile.isPending;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const isDarkMode = theme === "dark";

  const savedAddresses = [
    {
      id: 1,
      name: "Apex Johnson",
      address: "742 Evergreen Terrace",
      cityZip: "Springfield, 62704",
      phone: "+1 (555) 210-8899",
    },
    {
      id: 2,
      name: "Office Receiving",
      address: "1401 Market Street, Suite 600",
      cityZip: "San Francisco, 94103",
      phone: "+1 (555) 774-1200",
    },
  ];

  /** Seed the edit form from the current profile each time the modal opens. */
  const openEditModal = () => {
    setFormData({ full_name: profile.full_name, phone: profile.phone });
    setError("");
    setMessage("");
    setIsModalOpen(true);
  };

  const displayError = error || (profileError ? profileError.message : "");


  const handleThemeToggle = () => toggleTheme();

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      setError("Full name is required.");
      return;
    }

    setError("");
    setMessage("");

    try {
      await updateProfile.mutateAsync({
        full_name: formData.full_name,
        phone: formData.phone,
      });

      setMessage("Profile updated successfully ✅");
      setIsModalOpen(false);
    } catch (err) {
      setError(err?.message || "Server error while saving.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* HEADER WITH BACK BUTTON */}
      <div className="flex items-center gap-3 mb-6">

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 rounded-lg transition"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <h1 className="text-2xl font-semibold text-gray-900">
          Account Settings
        </h1>

      </div>

      {/* SUCCESS MESSAGE */}
      {message && (
        <div className="mb-6 max-w-3xl bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
          {message}
        </div>
      )}

      {/* ERROR MESSAGE */}
      {displayError && (
        <div className="mb-6 max-w-3xl bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl">
          {displayError}
        </div>
      )}

      {/* PROFILE CARD */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-3xl">

        <div className="flex justify-between items-center mb-6">

          <h2 className="text-lg font-semibold text-gray-900">
            Profile Information
          </h2>

          <button
            onClick={openEditModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition"
          >
            Edit
          </button>

        </div>

        <div className="space-y-5 text-gray-700">

          <div>
            <p className="text-sm text-gray-500">Full Name</p>
            <p className="font-medium text-gray-900">
              {profile.full_name || "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="font-medium text-gray-900">
              {profile.email}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500">Phone</p>
            <p className="font-medium text-gray-900">
              {profile.phone || "-"}
            </p>
          </div>

        </div>

      </div>

      {/* SAVED ADDRESSES */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-3xl mt-6">

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Saved Addresses
            </h2>
          </div>

          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-2">
            <Plus size={16} />
            Add New Address
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {savedAddresses.map((address) => (
            <div
              key={address.id}
              className="border border-gray-200 rounded-2xl p-4 shadow-sm bg-gray-50"
            >
              <p className="font-semibold text-gray-900">
                {address.name}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {address.address}
              </p>
              <p className="text-sm text-gray-600">
                {address.cityZip}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                {address.phone}
              </p>

              <div className="flex gap-2 mt-4">
                <button className="flex-1 border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 text-sm px-3 py-2 rounded-lg flex items-center justify-center gap-2">
                  <Pencil size={14} />
                  Edit Address
                </button>
                <button className="flex-1 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-sm px-3 py-2 rounded-lg flex items-center justify-center gap-2">
                  <Trash2 size={14} />
                  Delete Address
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* APPEARANCE */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-3xl mt-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Moon size={18} className="text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Dark Mode
              </h2>
              <p className="text-sm text-gray-500">
                Toggle the app theme between light and dark.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleThemeToggle}
            className={`w-14 h-8 rounded-full transition relative ${
              isDarkMode ? "bg-blue-600" : "bg-gray-200"
            }`}
            aria-pressed={isDarkMode}
          >
            <span
              className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition ${
                isDarkMode ? "translate-x-6" : ""
              }`}
            ></span>
          </button>
        </div>

      </div>

      {/* SECURITY */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-3xl mt-6">

        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck size={18} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Security
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-500">Current Password</label>
            <div className="mt-2 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
              <Lock size={16} className="text-gray-400" />
              <input
                type="password"
                placeholder="Enter current password"
                className="w-full outline-none text-gray-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">New Password</label>
            <div className="mt-2 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
              <Lock size={16} className="text-gray-400" />
              <input
                type="password"
                placeholder="Enter new password"
                className="w-full outline-none text-gray-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500">Confirm New Password</label>
            <div className="mt-2 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
              <Lock size={16} className="text-gray-400" />
              <input
                type="password"
                placeholder="Confirm new password"
                className="w-full outline-none text-gray-700 bg-transparent text-sm"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-semibold transition">
              Save Changes
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Password must be at least 8 characters and include 1 uppercase letter and 1 number.
        </p>

      </div>

      {/* EDIT PROFILE MODAL */}

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-lg w-full max-w-md">

            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Edit Profile
            </h2>

            <div className="space-y-4">

              <input
                type="text"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                placeholder="Full Name"
                className="w-full border border-gray-200 p-3 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <input
                type="email"
                value={profile.email}
                disabled
                className="w-full border border-gray-200 p-3 rounded-xl text-gray-400 bg-gray-50"
              />

              <input
                type="text"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                placeholder="Phone"
                className="w-full border border-gray-200 p-3 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            <div className="flex justify-end gap-3 mt-6">

              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                {saving ? "Saving..." : "Save"}
              </button>

            </div>

          </div>

        </div>
      )}
    </div>
  );
}
