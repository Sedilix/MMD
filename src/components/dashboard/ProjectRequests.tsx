"use client"

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { useFirestore, useUser } from '@/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { FolderLock, Inbox, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ClientRequest {
  id: string;
  agentId: string;
  agentName: string;
  clientName: string;
  clientEmail: string;
  linkedin: string | null;
  hpNumber: string;
  request: string;
  status: 'pending' | 'assigned';
  createdAt: any;
  aiMatch?: {
    matchedAgents: {
      uid: string;
      name: string;
      email: string;
      matchScore: number;
      reason: string;
    }[];
    reasoning: string;
    proposalId: string;
    evaluatedAt: string;
  };
}

export default function ProjectRequests() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ClientRequest | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);

  const handleTriggerMatch = async () => {
    if (!firestore || !user || !selectedRequest) return;
    setMatching(true);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/ai/match-agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ requestId: selectedRequest.id })
      });
      const data = await res.json();
      if (data.success && data.updatedRequest) {
        toast({
          title: "Auto-Match Succeeded",
          description: "One has matched technical specialists and drafted a client proposal.",
        });
        
        const updated = {
          id: selectedRequest.id,
          ...data.updatedRequest
        } as ClientRequest;
        
        setSelectedRequest(updated);
        setRequests(prev => prev.map(r => r.id === selectedRequest.id ? updated : r));
      } else {
        toast({
          title: "Auto-Match Failed",
          description: data.error || "Unknown error during matching.",
          variant: "destructive"
        });
      }
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Connection Error",
        description: e.message || "Failed to contact dispatch endpoint.",
        variant: "destructive"
      });
    } finally {
      setMatching(false);
    }
  };

  // Set up live subscriber for requests
  useEffect(() => {
    if (!firestore || !user) return;

    setLoading(true);
    const q = query(
      collection(firestore, 'client_requests'),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: ClientRequest[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as Omit<ClientRequest, 'id'>;
        
        // Filter: Show if it's unassigned or explicitly targeted to current user
        const isUnassigned = data.agentId === 'unassigned';
        const isTargetedToMe = data.agentId ? data.agentId.split(',').includes(user.uid) : false;

        if (isUnassigned || isTargetedToMe) {
          fetched.push({ id: doc.id, ...data } as ClientRequest);
        }
      });

      // Sort by creation time (newest first)
      fetched.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setRequests(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Failed to subscribe to client requests", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, user]);

  const handleClaimRequest = async (request: ClientRequest) => {
    if (!firestore || !user) return;
    setClaimingId(request.id);

    try {
      // 1. Update the request status and assign to user
      const requestRef = doc(firestore, 'client_requests', request.id);
      await updateDoc(requestRef, {
        status: 'assigned',
        agentId: user.uid,
        agentName: user.displayName || user.email?.split('@')[0] || 'Assigned Agent'
      });

      // 2. Automatically generate project container
      const autoTitle = `Client Launch: ${request.clientName}`;
      await addDoc(collection(firestore, 'projects'), {
        title: autoTitle,
        description: request.request,
        status: 'active',
        assignedTo: [user.email],
        createdAt: serverTimestamp()
      });

      toast({
        title: "Project Claims Successful",
        description: `You have successfully taken the project. Workspace space "${autoTitle}" has been allocated in your Warehouse.`,
      });

      setSelectedRequest(null);
    } catch (e) {
      console.error("Failed to claim request", e);
      toast({
        title: "Claim Failed",
        description: "An error occurred while claiming this project request.",
        variant: "destructive"
      });
    } finally {
      setClaimingId(null);
    }
  };

  const getAutoTitle = (req: ClientRequest) => {
    // Generate clean, modern client spec titles
    return `${req.clientName} Specs`;
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary animate-pulse" />
            Project Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live inbound inquiries and specs submitted by clients from the Work With Us channel.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Icon name="loading" className="h-8 w-8 animate-spin mb-4 text-primary" />
          <p className="text-sm font-medium">Synchronizing Inbound Pipeline...</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-border rounded-lg bg-background/50">
          <FolderLock className="h-12 w-12 text-muted-foreground mb-4 opacity-55" />
          <h3 className="text-lg font-medium text-foreground">Queue is empty</h3>
          <p className="text-sm text-muted-foreground max-w-md mt-1">
            There are currently no pending client requests or proposals needing attention.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {requests.map((req) => (
            <div 
              key={req.id} 
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all duration-300 group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider bg-orange-500/10 text-orange-500 border border-orange-500/20 uppercase">
                    <Icon name="clock" className="w-3 h-3" />
                    Pending
                  </span>
                  
                  {req.agentId && req.agentId !== 'unassigned' && (
                    <span className="text-[9px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                      DIRECTED TO YOU
                    </span>
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-1">
                  {getAutoTitle(req)}
                </h3>
                
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4 leading-relaxed font-sans">
                  {req.request}
                </p>

                {/* AI RAG Recommendation Badges */}
                {req.aiMatch && req.aiMatch.matchedAgents && req.aiMatch.matchedAgents.length > 0 && (
                  <div className="mb-4 space-y-1.5 bg-purple-950/15 border border-purple-500/10 p-2.5 rounded-lg">
                    <span className="text-[9px] font-mono text-purple-400 uppercase tracking-widest block font-bold">ONE's RAG Match:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {req.aiMatch.matchedAgents.slice(0, 2).map((agent: any) => (
                        <span 
                          key={agent.uid}
                          className="inline-flex items-center gap-1 text-[9px] font-mono font-bold bg-purple-500/10 border border-purple-500/20 text-purple-300 px-2 py-0.5 rounded"
                        >
                          {agent.name}: {(agent.matchScore * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                <span className="text-[10px] font-mono text-muted-foreground">
                  {req.createdAt && typeof req.createdAt === 'object' && 'seconds' in req.createdAt
                    ? new Date((req.createdAt as any).seconds * 1000).toLocaleDateString()
                    : 'Just now'}
                </span>
                
                <Button 
                  onClick={() => setSelectedRequest(req)} 
                  variant="outline" 
                  size="sm" 
                  className="h-8 text-xs font-semibold gap-1 text-primary border-primary/20 hover:bg-primary/10"
                >
                  <Icon name="show" className="h-3.5 w-3.5" /> Inspect
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={selectedRequest !== null} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl font-headline uppercase font-bold tracking-tight">
                      Client Specification Report
                    </DialogTitle>
                    <DialogDescription className="text-xs font-mono uppercase tracking-widest text-muted-foreground mt-1">
                      Request Reference: {selectedRequest.id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Client Profile details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted p-4 rounded-xl border border-border">
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest block">Client Identity</span>
                      <span className="text-sm font-bold text-foreground">{selectedRequest.clientName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest block">Contact Coordinates</span>
                      <a href={`mailto:${selectedRequest.clientEmail}`} className="text-sm text-primary hover:underline flex items-center gap-1.5 mt-0.5">
                        <Icon name="mail" className="w-3.5 h-3.5" /> {selectedRequest.clientEmail}
                      </a>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest block">Direct Mobile Link</span>
                      <a href={`tel:${selectedRequest.hpNumber}`} className="text-sm text-foreground flex items-center gap-1.5 mt-0.5">
                        <Icon name="phone" className="w-3.5 h-3.5 text-muted-foreground" /> {selectedRequest.hpNumber}
                      </a>
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest block">Social Verification</span>
                      {selectedRequest.linkedin ? (
                        <a 
                          href={selectedRequest.linkedin} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-sm text-blue-400 hover:underline flex items-center gap-1.5 mt-0.5"
                        >
                          <Icon name="external-link" className="w-3.5 h-3.5" /> LinkedIn Profile <Icon name="arrow-up-right-md" className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">None Provided</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Project spec details */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Mission Details & Requirements</h4>
                  <div className="bg-background p-5 rounded-xl border border-border whitespace-pre-wrap text-sm text-foreground leading-relaxed font-sans shadow-inner min-h-[160px]">
                    {selectedRequest.request}
                  </div>
                </div>

                {/* AI RAG Dispatch Matching */}
                <div className="border border-purple-500/20 bg-purple-950/5 p-5 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                      <h4 className="text-xs font-semibold uppercase text-purple-400 tracking-wider">ONE's RAG Dispatch Matching</h4>
                    </div>
                    <Button
                      onClick={handleTriggerMatch}
                      disabled={matching || claimingId !== null}
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] font-mono font-bold uppercase tracking-wider border-purple-500/30 text-purple-400 hover:bg-purple-500/10 cursor-pointer"
                    >
                      {matching ? (
                        <>
                          <Icon name="loading" className="w-3 h-3 animate-spin mr-1" /> Dispatching...
                        </>
                      ) : selectedRequest.aiMatch ? (
                        "Re-run Matching"
                      ) : (
                        "Run AI Matching"
                      )}
                    </Button>
                  </div>

                  {matching ? (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground font-mono text-[11px]">
                      <Icon name="loading" className="w-6 h-6 animate-spin text-purple-400 mb-2" />
                      <span>ANALYZING REQUEST SPECS...</span>
                      <span className="text-[9px] text-white/30 mt-0.5">SEMANTIC ROSTER SEARCH ACTIVE</span>
                    </div>
                  ) : selectedRequest.aiMatch ? (
                    <div className="space-y-4 text-left">
                      {/* Overall Reasoning */}
                      <p className="text-xs text-white/70 leading-relaxed font-sans bg-black/35 p-3 rounded-lg border border-white/5">
                        <strong className="text-purple-300 block mb-1 font-mono text-[10px] uppercase">RAG Match Summary:</strong>
                        {selectedRequest.aiMatch.reasoning}
                      </p>

                      {/* Matched Agents list */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">Matched Specialists</span>
                        <div className="grid grid-cols-1 gap-2">
                          {selectedRequest.aiMatch.matchedAgents.map((agent: any) => (
                            <div key={agent.uid} className="flex items-start justify-between p-3 rounded-lg bg-black/40 border border-white/5">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-white">{agent.name}</span>
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded">
                                    {(agent.matchScore * 100).toFixed(0)}% Match
                                  </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">{agent.reason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-white/10 rounded-lg text-white/30 font-mono text-xs">
                      No AI matches calculated yet. Run matching to auto-rank specialists.
                    </div>
                  )}
                </div>

                {/* Date and Targeted info */}
                <div className="flex justify-between items-center text-xs font-mono text-muted-foreground border-t border-border pt-4">
                  <span>
                    Received: {selectedRequest.createdAt && typeof selectedRequest.createdAt === 'object' && 'seconds' in selectedRequest.createdAt
                      ? new Date((selectedRequest.createdAt as any).seconds * 1000).toLocaleString()
                      : 'Just now'}
                  </span>
                  
                  {selectedRequest.agentId !== 'unassigned' && (
                    <span className="text-blue-500 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                      DIRECT ENTRUSTED ROUTE
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setSelectedRequest(null)}
                    disabled={claimingId !== null}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5"
                    onClick={() => handleClaimRequest(selectedRequest)}
                    disabled={claimingId !== null}
                  >
                    {claimingId === selectedRequest.id ? (
                      <>
                        <Icon name="loading" className="w-4 h-4 animate-spin" /> Provisioning...
                      </>
                    ) : (
                      <>
                        Take Project <Icon name="arrow-up-right-md" className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
