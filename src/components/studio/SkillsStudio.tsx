'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore } from '@/firebase';
import { doc, collection, setDoc, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import preinstalledSkills from '@/data/playground/skills.json';
import { SkillsMarketplace } from './SkillsMarketplace';
import { StripeEmbeddedOnboardingModal } from './StripeEmbeddedOnboardingModal';
import type { Skill } from '@/lib/playground/skills';

export default function SkillsStudio({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  // Navigation: 'editor' | 'marketplace'
  const [view, setView] = useState<'editor' | 'marketplace'>('editor');

  // Load skills
  const [systemSkills, setSystemSkills] = useState<Skill[]>(preinstalledSkills as Skill[]);
  const [customSkills, setCustomSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  // Form states
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [editWebSearch, setEditWebSearch] = useState(false);
  const [editRunCommands, setEditRunCommands] = useState(false);

  // Sync state
  const [loading, setLoading] = useState(true);

  // Publish-to-marketplace state
  const [publishPrice, setPublishPrice] = useState('0');
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedInfo, setPublishedInfo] = useState<{ published: boolean; priceCents?: number } | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  // AI Synthesis state (Gemini 3.7 Flash)
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContext, setAiContext] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Fetch custom skills from Firestore or LocalStorage
  const loadCustomSkills = async () => {
    setLoading(true);
    try {
      if (user && firestore) {
        const querySnapshot = await getDocs(collection(firestore, 'users', user.uid, 'skills'));
        const skills: Skill[] = [];
        querySnapshot.forEach((doc) => {
          skills.push({ id: doc.id, ...doc.data() } as Skill);
        });
        setCustomSkills(skills);
        if (skills.length > 0 && !selectedSkill) {
          setSelectedSkill(skills[0]);
        }
      } else {
        const local = localStorage.getItem('__cd_custom_skills');
        if (local) {
          const parsed = JSON.parse(local) as Skill[];
          setCustomSkills(parsed);
          if (parsed.length > 0 && !selectedSkill) {
            setSelectedSkill(parsed[0]);
          }
        }
      }
    } catch (err) {
      console.error('Error loading skills:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomSkills();
  }, [user, firestore]);

  // Set initial selected skill to Ponytail
  useEffect(() => {
    if (systemSkills.length > 0 && !selectedSkill) {
      setSelectedSkill(systemSkills[0]);
    }
  }, [systemSkills]);

  // Update form fields when selected skill changes
  useEffect(() => {
    if (selectedSkill) {
      setEditName(selectedSkill.name);
      setEditDesc(selectedSkill.description);
      setEditPrompt(selectedSkill.prompt);
      setEditWebSearch(selectedSkill.permissions?.webSearch ?? false);
      setEditRunCommands(selectedSkill.permissions?.runCommands ?? false);
    } else {
      setEditName('');
      setEditDesc('');
      setEditPrompt('');
      setEditWebSearch(false);
      setEditRunCommands(false);
    }
  }, [selectedSkill]);

  // Refresh the listing state whenever the selected custom skill changes.
  useEffect(() => {
    setPublishError(null);
    if (!selectedSkill?.isCustom || !user) {
      setPublishedInfo(null);
      return;
    }
    void (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/marketplace/publish?skillId=${encodeURIComponent(selectedSkill.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          setPublishedInfo({ published: Boolean(data.published), priceCents: data.priceCents });
          if (data.published && typeof data.priceCents === 'number') {
            setPublishPrice((data.priceCents / 100).toFixed(2));
          }
        }
      } catch {
        // A failed status read just leaves the panel in publish mode.
      }
    })();
  }, [selectedSkill?.id, selectedSkill?.isCustom, user]);

  const handlePublish = async () => {
    if (!selectedSkill?.isCustom || !user) return;
    const dollars = Number(publishPrice);
    if (!Number.isFinite(dollars) || dollars < 0) {
      setPublishError('Enter a valid price (0 for free).');
      return;
    }
    setPublishBusy(true);
    setPublishError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/marketplace/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skillId: selectedSkill.id, priceCents: Math.round(dollars * 100) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPublishedInfo({ published: true, priceCents: data.priceCents });
        toast({ title: 'Published', description: `"${selectedSkill.name}" is live on the marketplace.` });
      } else if (data?.needsStripeOnboarding) {
        setShowConnectModal(true);
      } else {
        setPublishError(data?.error || 'Publish failed.');
      }
    } catch {
      setPublishError('Could not reach the publish service.');
    } finally {
      setPublishBusy(false);
    }
  };

  const handleUnpublish = async () => {
    if (!selectedSkill?.isCustom || !user) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/marketplace/publish', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ skillId: selectedSkill.id }),
      });
      if (res.ok) {
        setPublishedInfo({ published: false });
        toast({ title: 'Unpublished', description: `"${selectedSkill.name}" was removed from the marketplace.` });
      } else {
        const data = await res.json().catch(() => ({}));
        setPublishError(data?.error || 'Unpublish failed.');
      }
    } catch {
      setPublishError('Could not reach the publish service.');
    } finally {
      setPublishBusy(false);
    }
  };

  // Handle Save
  const handleSave = async () => {
    if (!editName.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Skill name is required.',
        variant: 'destructive',
      });
      return;
    }

    const isNew = !selectedSkill || selectedSkill.isCustom === false;
    const skillId = isNew ? `skill-${Date.now()}` : selectedSkill!.id;

    const updatedSkill: Skill = {
      id: skillId,
      name: editName,
      description: editDesc,
      prompt: editPrompt,
      permissions: {
        webSearch: editWebSearch,
        runCommands: editRunCommands,
      },
      isCustom: true,
    };

    try {
      if (user && firestore) {
        await setDoc(doc(firestore, 'users', user.uid, 'skills', skillId), {
          name: updatedSkill.name,
          description: updatedSkill.description,
          prompt: updatedSkill.prompt,
          permissions: updatedSkill.permissions,
          isCustom: true,
        });
      }

      // Update local storage representation
      const currentList = [...customSkills];
      const index = currentList.findIndex((s) => s.id === skillId);
      if (index >= 0) {
        currentList[index] = updatedSkill;
      } else {
        currentList.push(updatedSkill);
      }
      setCustomSkills(currentList);
      localStorage.setItem('__cd_custom_skills', JSON.stringify(currentList));

      setSelectedSkill(updatedSkill);
      toast({
        title: 'Success',
        description: `Skill "${editName}" saved successfully.`,
      });
    } catch (err) {
      console.error('Save failed:', err);
      toast({
        title: 'Error',
        description: 'Failed to save skill settings.',
        variant: 'destructive',
      });
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!selectedSkill || !selectedSkill.isCustom) return;

    try {
      if (user && firestore) {
        await deleteDoc(doc(firestore, 'users', user.uid, 'skills', selectedSkill.id));
      }

      const currentList = customSkills.filter((s) => s.id !== selectedSkill.id);
      setCustomSkills(currentList);
      localStorage.setItem('__cd_custom_skills', JSON.stringify(currentList));

      toast({
        title: 'Deleted',
        description: `Skill "${selectedSkill.name}" has been removed.`,
      });

      if (currentList.length > 0) {
        setSelectedSkill(currentList[0]);
      } else if (systemSkills.length > 0) {
        setSelectedSkill(systemSkills[0]);
      } else {
        setSelectedSkill(null);
      }
    } catch (err) {
      console.error('Delete failed:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete skill.',
        variant: 'destructive',
      });
    }
  };

  // Create empty skill draft
  const handleCreateNew = () => {
    const draft: Skill = {
      id: `draft-${Date.now()}`,
      name: 'New Custom Skill',
      description: 'Describe what this skill does...',
      prompt: 'Write the system prompt instructions here...',
      permissions: {
        webSearch: false,
        runCommands: false,
      },
      isCustom: true,
    };
    setSelectedSkill(draft);
  };

  // Install skill from marketplace
  const handleInstallFromMarketplace = async (marketSkill: Skill) => {
    const newCustom: Skill = {
      ...marketSkill,
      id: marketSkill.id,
      isCustom: true,
    };

    try {
      if (user && firestore) {
        await setDoc(doc(firestore, 'users', user.uid, 'skills', newCustom.id), {
          name: newCustom.name,
          description: newCustom.description,
          prompt: newCustom.prompt,
          permissions: newCustom.permissions,
          isCustom: true,
        });
      }

      const currentList = [...customSkills];
      if (!currentList.some((s) => s.id === newCustom.id)) {
        currentList.push(newCustom);
      }
      setCustomSkills(currentList);
      localStorage.setItem('__cd_custom_skills', JSON.stringify(currentList));

      toast({
        title: 'Installed',
        description: `Successfully installed "${newCustom.name}" to your library.`,
      });
    } catch (err) {
      console.error('Install failed:', err);
    }
  };

  // Synthesize skill with Gemini 3.7 Flash
  const handleGenerateSkill = async () => {
    if (!aiPrompt.trim() && !aiContext.trim()) {
      toast({
        title: 'Input required',
        description: 'Please describe the skill or provide reference code.',
        variant: 'destructive',
      });
      return;
    }

    setAiGenerating(true);
    try {
      const token = user ? await user.getIdToken() : '';
      const res = await fetch('/api/studio/skills/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          context: aiContext,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to synthesize skill');
      }

      const generated = data.skill;
      const draft: Skill = {
        id: `skill-${Date.now()}`,
        name: generated.name,
        description: generated.description,
        prompt: generated.prompt,
        permissions: generated.permissions || { webSearch: false, runCommands: false },
        isCustom: true,
      };

      setSelectedSkill(draft);
      setEditName(draft.name);
      setEditDesc(draft.description);
      setEditPrompt(draft.prompt);
      setEditWebSearch(draft.permissions?.webSearch ?? false);
      setEditRunCommands(draft.permissions?.runCommands ?? false);

      setShowAiModal(false);
      setAiPrompt('');
      setAiContext('');

      toast({
        title: 'Skill Synthesized',
        description: `Generated "${draft.name}" with Gemini 3.7 Flash. Review and save below.`,
      });
    } catch (err: any) {
      console.error('AI synthesis failed:', err);
      toast({
        title: 'Synthesis Failed',
        description: err.message || 'Could not generate skill.',
        variant: 'destructive',
      });
    } finally {
      setAiGenerating(false);
    }
  };

  if (view === 'marketplace') {
    return (
      <SkillsMarketplace
        onBack={() => setView('editor')}
        installedSkillIds={customSkills.map((s) => s.id)}
        onInstall={handleInstallFromMarketplace}
      />
    );
  }

  // Count lines for the IDE side view
  const linesCount = Math.max(15, editPrompt.split('\n').length + 2);
  const lineNumbers = Array.from({ length: linesCount }, (_, i) => i + 1);

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100 font-sans border-r border-border">
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:h-14 items-start sm:items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 sm:px-6 py-2.5 sm:py-0 shrink-0 gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 text-rose-400 shrink-0">
            <Icon name="code" className="h-5 w-5" />
            <h1 className="text-xs sm:text-sm font-bold tracking-wider uppercase">Skills Manager</h1>
          </div>
          <span className="text-zinc-700 hidden xs:inline">|</span>
          <p className="text-[11px] sm:text-xs text-zinc-400 truncate hidden xs:block">Configure custom RAG skills and sandbox permissions</p>
        </div>

        <div className="flex items-center justify-between w-full sm:w-auto gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAiModal(true)}
            className="h-7 sm:h-8 gap-1.5 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30 px-2 sm:px-3 font-medium"
          >
            <Icon name="sparkles" className="h-3.5 w-3.5 text-rose-400" />
            <span>Synthesize with AI</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setView('marketplace')}
            className="h-7 sm:h-8 gap-1.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 sm:px-3"
          >
            <Icon name="shopping-bag-01" className="h-3.5 w-3.5" />
            <span>Marketplace</span>
          </Button>
          <Button
            size="sm"
            onClick={onClose}
            className="h-7 sm:h-8 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-3"
          >
            Close
          </Button>
        </div>
      </div>

      {/* Main Split Window */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left IDE File-Tree Explorer (Horizontal on mobile, vertical sidebar on desktop) */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900 flex flex-col shrink-0 max-h-40 md:max-h-none overflow-hidden">
          <div className="p-2.5 md:p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Explorer</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAiModal(true)}
                className="h-6 px-1.5 text-[10px] hover:bg-zinc-800 text-rose-400 hover:text-rose-300 gap-1"
                title="Synthesize skill with Gemini 3.7 Flash"
              >
                <Icon name="sparkles" className="h-3 w-3" />
                <span>AI</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCreateNew}
                className="h-6 w-6 p-0 hover:bg-zinc-800 text-rose-400 hover:text-rose-300"
                title="New custom skill"
              >
                <Icon name="plus" className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3 scrollbar-none text-xs">
            {/* PRE-INSTALLED GROUP */}
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center gap-1.5 text-zinc-500 font-semibold uppercase tracking-wider text-[9px]">
                <Icon name="folder" className="h-3 w-3 shrink-0" />
                <span>Pre-installed Skills</span>
              </div>
              <div className="space-y-0.5 px-1.5">
                {systemSkills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSkill(s)}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-all text-left ${
                      selectedSkill?.id === s.id
                        ? 'bg-zinc-800 text-rose-400 font-semibold'
                        : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                    }`}
                  >
                    <Icon name="file-document" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* CUSTOM / MY SKILLS GROUP */}
            <div className="space-y-1">
              <div className="px-3 py-1 flex items-center gap-1.5 text-zinc-500 font-semibold uppercase tracking-wider text-[9px]">
                <Icon name="folder" className="h-3 w-3 shrink-0" />
                <span>My Library ({customSkills.length})</span>
              </div>
              <div className="space-y-0.5 px-1.5">
                {customSkills.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSkill(s)}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-all text-left ${
                      selectedSkill?.id === s.id
                        ? 'bg-zinc-800 text-rose-400 font-semibold'
                        : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                    }`}
                  >
                    <Icon name="file-code" className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </button>
                ))}
                {customSkills.length === 0 && (
                  <p className="px-3 py-2 text-[10px] text-zinc-600 italic">No custom skills yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-zinc-800 bg-zinc-950/40 text-[10px] text-zinc-500 font-mono text-center">
            WORKSPACE ROOT
          </div>
        </div>

        {/* Right Editor Panel */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          {selectedSkill ? (
            <>
              {/* Tab Header */}
              <div className="flex h-10 border-b border-zinc-800 bg-zinc-900 items-center px-4 justify-between shrink-0">
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <Icon name="file-code" className="h-4 w-4 text-rose-400" />
                  <span className="font-mono text-zinc-300">{selectedSkill.id}.md</span>
                  {selectedSkill.isCustom ? (
                    <span className="rounded bg-rose-500/10 px-1 py-0.2 text-[8px] font-medium text-rose-400 uppercase tracking-widest border border-rose-500/20">
                      Editable
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-800 px-1 py-0.2 text-[8px] font-medium text-zinc-400 uppercase tracking-widest border border-zinc-700">
                      Read-Only
                    </span>
                  )}
                </div>

                {selectedSkill.isCustom && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDelete}
                      className="h-7 px-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 gap-1 text-[11px]"
                    >
                      <Icon name="trash-empty" className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      className="h-7 px-3 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold gap-1"
                    >
                      <Icon name="save" className="h-3.5 w-3.5" />
                      Save File
                    </Button>
                  </div>
                )}
              </div>

              {/* Editing Form Strip (Top half of editor) */}
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-400">Skill Display Name</label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={!selectedSkill.isCustom}
                    className="h-8 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-rose-500/50"
                    placeholder="e.g. My Custom Rails Helper"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-400">Description</label>
                  <Input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    disabled={!selectedSkill.isCustom}
                    className="h-8 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-rose-500/50"
                    placeholder="Short description of capabilities"
                  />
                </div>

                {/* Permissions Toggles */}
                <div className="md:col-span-2 border-t border-zinc-800/80 pt-3 mt-1 flex flex-wrap gap-6 items-center">
                  <div className="flex items-center space-x-2.5">
                    <input
                      type="checkbox"
                      id="web-search"
                      checked={editWebSearch}
                      onChange={(e) => setEditWebSearch(e.target.checked)}
                      disabled={!selectedSkill.isCustom}
                      className="rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500 h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <label htmlFor="web-search" className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold cursor-pointer select-none">
                      <Icon name="globe" className="h-3.5 w-3.5 text-sky-400" />
                      Grant Web Search Permission
                    </label>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <input
                      type="checkbox"
                      id="run-commands"
                      checked={editRunCommands}
                      onChange={(e) => setEditRunCommands(e.target.checked)}
                      disabled={!selectedSkill.isCustom}
                      className="rounded border-zinc-700 bg-zinc-950 text-rose-500 focus:ring-rose-500 h-4 w-4 shrink-0 cursor-pointer"
                    />
                    <label htmlFor="run-commands" className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold cursor-pointer select-none">
                      <Icon name="terminal" className="h-3.5 w-3.5 text-purple-400" />
                      Grant Script / Command execution
                    </label>
                  </div>
                </div>

                {/* Publish-to-marketplace strip (custom skills only) */}
                {selectedSkill.isCustom && (
                  <div className="md:col-span-2 border-t border-zinc-800/80 pt-3 mt-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-zinc-400">Marketplace</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500 font-mono">$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={publishPrice}
                          onChange={(e) => setPublishPrice(e.target.value)}
                          disabled={publishBusy}
                          className="h-8 w-24 bg-zinc-950 border-zinc-800 text-zinc-100"
                        />
                      </div>
                      {publishedInfo?.published ? (
                        <>
                          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Live</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleUnpublish}
                            disabled={publishBusy}
                            className="h-8 px-3 text-[11px] text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                          >
                            Unpublish
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handlePublish}
                          disabled={publishBusy}
                          className="h-8 px-3 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold"
                        >
                          Publish to Marketplace
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      Price 0 lists it free. Paid listings need a verified Stripe payout account — you keep 70%.
                    </p>
                    {publishError && <p className="text-[10px] text-red-400">{publishError}</p>}
                  </div>
                )}
              </div>

              {/* IDE Code Area */}
              <div className="flex-1 flex overflow-hidden min-h-0 relative">
                {/* Line Numbers column */}
                <div className="w-10 border-r border-zinc-800/50 bg-zinc-950 text-right select-none pr-2.5 py-4 font-mono text-[10px] text-zinc-600 leading-6">
                  {lineNumbers.map((num) => (
                    <div key={num}>{num}</div>
                  ))}
                </div>

                {/* Textarea */}
                <div className="flex-1 min-w-0 h-full p-4 font-mono text-xs leading-6 bg-zinc-950 relative">
                  <Textarea
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    disabled={!selectedSkill.isCustom}
                    className="w-full h-full border-0 p-0 bg-transparent text-zinc-300 placeholder:text-zinc-700 resize-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 leading-6 overflow-y-auto font-mono"
                    placeholder="# Write your custom prompt instructions here..."
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Icon name="code" className="h-10 w-10 text-zinc-700 mb-2" />
              <h3 className="text-sm font-bold text-zinc-400">No Skill Selected</h3>
              <p className="text-xs text-zinc-600 max-w-[240px] mt-1">
                Select a skill from the sidebar or create a new custom skill.
              </p>
            </div>
          )}
        </div>
      </div>

      <StripeEmbeddedOnboardingModal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        creatorUserId={user?.uid ?? undefined}
        email={user?.email ?? undefined}
      />

      {/* AI Skill Synthesizer Modal (Gemini 3.7 Flash) */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <Icon name="sparkles" className="h-5 w-5" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                  Synthesize Skill with Gemini 3.7 Flash
                </h3>
              </div>
              <button
                onClick={() => setShowAiModal(false)}
                disabled={aiGenerating}
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg text-xs"
              >
                <Icon name="close-md" className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Describe the capabilities, rules, and desired behaviors of your skill, or paste reference code and repository files for context.
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Skill Goal & Prompt Requirements</label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  disabled={aiGenerating}
                  rows={3}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 focus-visible:ring-rose-500/50 resize-none"
                  placeholder="e.g. Create a senior Next.js App Router code reviewer that enforces Server Component best practices, verifies route segment configurations, and formats feedback in actionable diffs."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">Reference Code & Context (Optional)</label>
                <Textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  disabled={aiGenerating}
                  rows={4}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono focus-visible:ring-rose-500/50 resize-none"
                  placeholder="// Paste reference code, schema definitions, or whole repository files here..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAiModal(false)}
                disabled={aiGenerating}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateSkill}
                disabled={aiGenerating || (!aiPrompt.trim() && !aiContext.trim())}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-1.5 px-4"
              >
                {aiGenerating ? (
                  <>
                    <Icon name="spinner" className="h-3.5 w-3.5 animate-spin" />
                    <span>Reasoning & Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" className="h-3.5 w-3.5" />
                    <span>Synthesize with Gemini</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
