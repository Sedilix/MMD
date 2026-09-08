"use client"

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useUser, useFirestore } from '@/firebase';
import { collection, getDocs, doc } from 'firebase/firestore';
import { useDoc } from '@/firebase';
import { Button } from '@/components/ui/button';

interface UserProfile {
  id: string; // Document ID (UID)
  email: string;
  role?: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
  approvedAt?: string;
  createdAt?: string;
}

const ACCOUNT_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'core', label: 'Core' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'partner', label: 'Partner' },
  { value: 'community', label: 'Community Member' },
  { value: 'client', label: 'Client' },
];

export default function ManageUsersPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const filteredUsers = React.useMemo(() => {
    return users.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch = name.includes(query) || email.includes(query);
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, searchQuery, roleFilter]);

  const adminDocRef = React.useMemo(() => {
    if (!firestore || !user?.email) return null;
    return doc(firestore, 'admins', user.email.toLowerCase());
  }, [firestore, user?.email]);

  const { data: adminDoc } = useDoc(adminDocRef);
  const adminData = adminDoc as { role?: string; uiAccess?: boolean } | null;
  const isAdmin = adminData?.role === 'admin' && adminData?.uiAccess === true;

  const fetchUsers = async () => {
    if (!firestore) return;
    setLoading(true);
    setError('');
    try {
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const membersSnapshot = await getDocs(collection(firestore, 'members'));
      
      const membersMap = new Map<string, any>();
      membersSnapshot.forEach((docSnap) => {
        membersMap.set(docSnap.id, docSnap.data());
      });

      const roleMap: Record<string, string> = {
        'admin': 'admin',
        'core': 'core',
        'specialist': 'specialist',
        'agent': 'specialist',
        'partner': 'partner',
        'community': 'community',
        'community member': 'community',
        'client': 'client',
      };

      const list: UserProfile[] = [];
      const seenUids = new Set<string>();

      usersSnapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        const docId = docSnap.id;
        const uid = userData.uid || (docId.includes('@') ? '' : docId);

        // Deduplicate records keyed by email vs UID
        const uniqueKey = uid || docId;
        if (seenUids.has(uniqueKey)) return;
        if (uid) seenUids.add(uid);

        const memberData = membersMap.get(uid || docId) || {};
        const email = userData.email || (docId.includes('@') ? docId : '');
        const emailPrefix = email ? email.split('@')[0] : '';
        const fallbackName = emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : 'Unspecified Name';
        
        const rawRole = (userData.role || userData.portalRole || '').toString().toLowerCase();
        const role = roleMap[rawRole] || (rawRole === 'agent' ? 'specialist' : rawRole) || 'specialist';

        list.push({
          id: uid || docId,
          email,
          role,
          approvedAt: userData.approvedAt,
          createdAt: userData.createdAt || memberData.createdAt,
          name: memberData.name || userData.displayName || userData.name || fallbackName,
          avatarUrl: memberData.avatarUrl || userData.avatarUrl || '',
        });
      });

      setUsers(list);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      setError("Failed to load users list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin || !firestore) return;
    fetchUsers();
  }, [user, isAdmin, firestore]);

  const handleRoleChange = async (targetUid: string, newRole: string) => {
    if (!user) return;
    setUpdatingId(targetUid);
    setError('');
    setSuccess('');

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ targetUid, role: newRole })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user role');
      }

      setSuccess(`Updated role successfully.`);
      // Update local state
      setUsers(prev => prev.map(u => u.id === targetUid ? { ...u, role: newRole } : u));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSyncRepair = async () => {
    if (!user) return;
    setRepairing(true);
    setError('');
    setSuccess('');

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/admin/repair-users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync/repair failed');
      setSuccess(`Repaired & synced ${data.repairedCount || 0} user records.`);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to repair user profiles.');
    } finally {
      setRepairing(false);
    }
  };

  if (!isAdmin) {
    return <div className="p-8 text-red-500">Access Denied: Admin privileges required.</div>;
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span className="hover:underline cursor-pointer text-primary">Admin Operations</span>
            <Icon name="chevron-right" className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-normal text-foreground">Manage Users & Members</h1>
          </div>
        </div>
        <Button
          onClick={handleSyncRepair}
          disabled={repairing || loading}
          variant="outline"
          className="gap-2 text-xs font-mono border-border hover:bg-muted"
        >
          {repairing ? <Icon name="loading" className="h-4 w-4 animate-spin text-primary" /> : <Icon name="refresh" className="h-4 w-4" />}
          Sync & Repair Accounts
        </Button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-950/40 border border-red-900/60 rounded flex items-center gap-3 text-red-200 text-sm">
          <Icon name="shield-warning" className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-950/40 border border-green-900/60 rounded flex items-center gap-3 text-green-200 text-sm">
          <Icon name="circle-check" className="h-5 w-5 shrink-0 text-green-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Search and Filter Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-card border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-muted-foreground transition-colors"
          />
        </div>
        <div className="w-full md:w-60">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer"
          >
            <option value="all">All Account Types</option>
            {ACCOUNT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto bg-card shadow-sm text-card-foreground">
        <table className="w-full min-w-[700px] text-left text-sm text-muted-foreground">
          <thead className="bg-muted text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-3 font-medium">User</th>
              <th className="px-6 py-3 font-medium">Email</th>
              <th className="px-6 py-3 font-medium">Join Date</th>
              <th className="px-6 py-3 font-medium">Approved Date</th>
              <th className="px-6 py-3 font-medium text-right">Account Type Tag</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  <Icon name="loading" className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Loading users roster...
                </td>
              </tr>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((item) => (
                <tr key={item.id} className="hover:bg-muted/50 group transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt="Avatar" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-border object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border text-muted-foreground">
                          <Icon name="user-check" className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">{item.name || item.displayName || 'Unspecified Name'}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">UID: {item.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
                    {item.email || '—'}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs font-mono">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs font-mono">
                    {item.approvedAt ? new Date(item.approvedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {updatingId === item.id && (
                        <Icon name="loading" className="h-4 w-4 animate-spin text-primary" />
                      )}
                      <select
                        value={item.role || 'specialist'}
                        disabled={updatingId === item.id}
                        onChange={(e) => handleRoleChange(item.id, e.target.value)}
                        className="bg-background border border-border rounded px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary disabled:opacity-50"
                      >
                        {ACCOUNT_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  No users found in database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t border-border flex items-center justify-end text-xs text-muted-foreground gap-4 bg-card">
          <span>Showing {filteredUsers.length} of {users.length} members</span>
        </div>
      </div>
    </>
  );
}
