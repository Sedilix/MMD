"use client"

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { useAuth, useUser, useFirestore, useDoc } from '@/firebase';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Application {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: any;
  bio?: string;
  skills?: string[];
  avatarUrl?: string;
  driveFolderId?: string;
  resumeFileId?: string;
}

type TabType = 'pending' | 'approved' | 'rejected';

export default function ManageApplicantsPage() {
  const { user } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customMessages, setCustomMessages] = useState<Record<string, string>>({});

  const adminDocRef = React.useMemo(() => {
    if (!firestore || !user?.email) return null;
    return doc(firestore, 'admins', user.email.toLowerCase());
  }, [firestore, user?.email]);

  const { data: adminDoc } = useDoc(adminDocRef);
  const adminData = adminDoc as { role?: string; uiAccess?: boolean } | null;
  const isAdmin = adminData?.role === 'admin' && adminData?.uiAccess === true;

  useEffect(() => {
    if (!user || !isAdmin || !firestore) return;

    const fetchApplications = async () => {
      setLoading(true);
      setError('');
      try {
        const q = query(collection(firestore, 'specialist_applications'), where('status', '==', activeTab));
        const querySnapshot = await getDocs(q);
        const apps: Application[] = [];
        querySnapshot.forEach((doc) => {
          apps.push({ id: doc.id, ...doc.data() } as Application);
        });
        
        apps.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
        
        setApplications(apps);
      } catch (err: any) {
        console.error("Error fetching applications:", err);
        setError("Failed to load applications.");
      } finally {
        setLoading(false);
      }
    };

    fetchApplications();
  }, [user, isAdmin, firestore, activeTab]);

  const handleApprove = async (app: Application, message?: string) => {
    if (!auth || !user) return;
    setProcessingId(app.id);
    setError('');
    setSuccess('');

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/approve-applicant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          applicationId: app.id,
          email: app.email,
          name: app.name,
          customMessage: message || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve applicant');
      }

      setSuccess(`Successfully approved ${app.name}. Credentials sent.`);
      setApplications(prev => prev.filter(a => a.id !== app.id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span className="hover:underline cursor-pointer text-primary">Admin Operations</span>
          <Icon name="chevron-right" className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-normal text-foreground">Manage Applicants</h1>
        </div>
      </div>

      <div className="border-b border-border mb-8 flex gap-8 text-sm">
        {(['pending', 'approved', 'rejected'] as TabType[]).map((tab) => (
          <div 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 cursor-pointer capitalize ${activeTab === tab ? 'text-primary font-medium border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded flex items-center gap-3 text-red-700 text-sm">
          <Icon name="shield-warning" className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded flex items-center gap-3 text-green-700 text-sm">
          <Icon name="circle-check" className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-base font-normal text-foreground capitalize">{activeTab} Applications</h2>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto bg-card shadow-sm text-card-foreground">
        <table className="w-full min-w-[600px] text-left text-sm text-muted-foreground">
          <thead className="bg-muted text-muted-foreground border-b border-border">
            <tr>
              <th className="px-6 py-3 font-medium">Candidate</th>
              <th className="px-6 py-3 font-medium">Specialization</th>
              <th className="px-6 py-3 font-medium">Date</th>
              <th className="px-6 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                  <Icon name="loading" className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Loading applications...
                </td>
              </tr>
            ) : applications.length > 0 ? (
              applications.map((app) => (
                <tr key={app.id} className="hover:bg-muted/50 group transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {app.avatarUrl ? (
                        <img src={app.avatarUrl} alt="Avatar" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-border object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border text-muted-foreground">
                          <Icon name="user-check" className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">{app.name}</div>
                        <div className="text-xs text-muted-foreground">{app.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div 
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20 max-w-[200px] truncate"
                      title={app.role || 'Unspecified'}
                    >
                      {app.role || 'Unspecified'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground whitespace-nowrap text-xs">
                    {app.createdAt && typeof app.createdAt === 'object' && 'seconds' in app.createdAt
                        ? new Date((app.createdAt as any).seconds * 1000).toLocaleDateString()
                        : 'Just now'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 text-xs font-medium">
                            <Icon name="show" className="w-3.5 h-3.5 mr-1.5" /> View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle className="text-xl">Applicant Dossier</DialogTitle>
                            <DialogDescription>
                              ID: {app.id} • Status: <span className="capitalize">{app.status}</span>
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-6 py-4">
                            <div className="flex items-start gap-4 border-b border-border pb-6">
                              {app.avatarUrl ? (
                                <img src={app.avatarUrl} alt="Avatar" referrerPolicy="no-referrer" className="w-20 h-20 rounded-xl border border-border object-cover shadow-sm" />
                              ) : (
                                <div className="w-20 h-20 rounded-xl border border-border bg-muted flex items-center justify-center text-muted-foreground shadow-sm">
                                  <Icon name="user-check" className="w-8 h-8" />
                                </div>
                              )}
                              <div>
                                <h3 className="text-xl font-bold text-foreground">{app.name}</h3>
                                <p className="text-sm text-muted-foreground">{app.email}</p>
                                <div className="mt-2 inline-block px-2.5 py-1 bg-primary/10 border border-primary/20 text-primary rounded-md text-xs font-medium">
                                  {app.role || 'Unspecified'}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Professional Bio</h4>
                              <div className="bg-muted p-4 rounded-lg border border-border whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                                {app.bio || 'No bio provided.'}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Technical Arsenal</h4>
                              <div className="flex flex-wrap gap-2">
                                {app.skills && app.skills.length > 0 ? (
                                  app.skills.map((skill, idx) => (
                                    <span key={idx} className="px-2.5 py-1 bg-background border border-border rounded-md text-xs text-foreground shadow-sm">
                                      {skill}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">No skills listed.</span>
                                )}
                              </div>
                            </div>

                            <div className="pt-4 flex flex-wrap gap-3 border-t border-border">
                              {app.driveFolderId && (
                                <Button variant="outline" className="text-primary border-primary/30 hover:bg-primary/10" onClick={() => window.open(`https://drive.google.com/drive/folders/${app.driveFolderId}`, '_blank')}>
                                    <Icon name="external-link" className="w-4 h-4 mr-2" /> Drive Folder
                                </Button>
                              )}
                              {app.resumeFileId && (
                                <Button variant="outline" className="text-pink-600 border-pink-200 hover:bg-pink-50" onClick={() => window.open(`https://drive.google.com/file/d/${app.resumeFileId}/view`, '_blank')}>
                                    <Icon name="file-document" className="w-4 h-4 mr-2" /> View Resume
                                </Button>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {activeTab === 'pending' && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 text-xs font-medium px-4">
                              Approve
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Approve {app.name}</DialogTitle>
                              <DialogDescription>
                                Add a custom message to the approval email. Leave blank to use the default template. The temporary credentials will be automatically appended.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <textarea
                                className="w-full min-h-[150px] p-3 border border-border rounded-md text-base md:text-sm text-foreground bg-background"
                                placeholder="e.g. Your application has been reviewed and approved by matrix operations."
                                value={customMessages[app.id] ?? ''}
                                onChange={(e) => setCustomMessages(prev => ({...prev, [app.id]: e.target.value}))}
                              />
                            </div>
                            <div className="flex justify-end gap-3 mt-4">
                              <Button 
                                onClick={() => handleApprove(app, customMessages[app.id])}
                                disabled={processingId === app.id}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                              >
                                {processingId === app.id ? <Icon name="loading" className="h-4 w-4 animate-spin mr-2" /> : null}
                                Send Approval Email
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Icon name="user-check" className="h-8 w-8 text-muted-foreground/50" />
                    <p>No {activeTab} applications found.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-6 py-3 border-t border-border flex items-center justify-end text-sm text-muted-foreground gap-4 bg-card">
          <span>Items per page: 10 <Icon name="chevron-down" className="inline h-4 w-4" /></span>
          <span>1 - {applications?.length || 0} of {applications?.length || 0}</span>
        </div>
      </div>
    </>
  );
}
