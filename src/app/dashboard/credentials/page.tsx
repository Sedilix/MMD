"use client";

import { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/components/ui/icon';
import { doc, updateDoc } from 'firebase/firestore';
import { useUser, useFirestore, useDoc } from '@/firebase';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { 
  SiReact, SiTypescript, SiNextdotjs, SiPython, SiFirebase, 
  SiTailwindcss, SiNodedotjs, SiKubernetes, SiDocker, SiGooglecloud, 
  SiGo, SiRust, SiPostgresql, SiGraphql 
} from 'react-icons/si';
import { FaBrain, FaNetworkWired, FaRobot, FaAws } from 'react-icons/fa6';

const PREDEFINED_SKILLS = [
  'React', 'TypeScript', 'Next.js', 'Python', 'Genkit', 'Firebase',
  'TailwindCSS', 'Node.js', 'Kubernetes', 'Docker', 'GCP', 'AWS',
  'Go', 'Rust', 'PostgreSQL', 'GraphQL', 'Machine Learning', 'API Design'
];

const SKILL_ICONS: Record<string, React.ReactNode> = {
  'React': <SiReact className="w-3.5 h-3.5 mr-1.5" />,
  'TypeScript': <SiTypescript className="w-3.5 h-3.5 mr-1.5" />,
  'Next.js': <SiNextdotjs className="w-3.5 h-3.5 mr-1.5" />,
  'Python': <SiPython className="w-3.5 h-3.5 mr-1.5" />,
  'Genkit': <FaRobot className="w-3.5 h-3.5 mr-1.5" />,
  'Firebase': <SiFirebase className="w-3.5 h-3.5 mr-1.5" />,
  'TailwindCSS': <SiTailwindcss className="w-3.5 h-3.5 mr-1.5" />,
  'Node.js': <SiNodedotjs className="w-3.5 h-3.5 mr-1.5" />,
  'Kubernetes': <SiKubernetes className="w-3.5 h-3.5 mr-1.5" />,
  'Docker': <SiDocker className="w-3.5 h-3.5 mr-1.5" />,
  'GCP': <SiGooglecloud className="w-3.5 h-3.5 mr-1.5" />,
  'AWS': <FaAws className="w-3.5 h-3.5 mr-1.5" />,
  'Go': <SiGo className="w-3.5 h-3.5 mr-1.5" />,
  'Rust': <SiRust className="w-3.5 h-3.5 mr-1.5" />,
  'PostgreSQL': <SiPostgresql className="w-3.5 h-3.5 mr-1.5" />,
  'GraphQL': <SiGraphql className="w-3.5 h-3.5 mr-1.5" />,
  'Machine Learning': <FaBrain className="w-3.5 h-3.5 mr-1.5" />,
  'API Design': <FaNetworkWired className="w-3.5 h-3.5 mr-1.5" />
};

export default function CredentialsPage() {
  const router = useRouter();
  const firestore = useFirestore();
  const { user } = useUser();

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [role, setRole] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const memberDocRef = useMemo(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'members', user.uid);
  }, [firestore, user?.uid]);

  const { data: memberDoc, loading: memberLoading } = useDoc(memberDocRef);

  const adminDocRef = useMemo(() => {
    if (!firestore || !user?.email) return null;
    return doc(firestore, 'admins', user.email.toLowerCase());
  }, [firestore, user?.email]);

  const { data: adminDoc } = useDoc(adminDocRef);
  const isAdmin = adminDoc?.role === 'admin' && adminDoc?.uiAccess === true;

  useEffect(() => {
    document.title = "Credentials - Cybrdeck";
  }, []);

  useEffect(() => {
    if (memberDoc) {
      setName(memberDoc.name || '');
      setAvatarUrl(memberDoc.avatarUrl || '');
      setBio(memberDoc.bio || '');
      setRole(memberDoc.role || '');
      
      const skillsList = memberDoc.skills || [];
      setSelectedSkills(skillsList);
      
      const custom = skillsList.filter((s: string) => !PREDEFINED_SKILLS.includes(s));
      setCustomSkills(custom);
    }
  }, [memberDoc]);

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill) 
        : [...prev, skill]
    );
  };

  const handleAddCustomSkill = () => {
    const trimmed = customSkillInput.trim();
    if (!trimmed) return;
    
    const allAvailable = [...PREDEFINED_SKILLS, ...customSkills];
    if (!allAvailable.includes(trimmed)) {
      setCustomSkills(prev => [...prev, trimmed]);
    }

    if (!selectedSkills.includes(trimmed)) {
      setSelectedSkills(prev => [...prev, trimmed]);
    }
    setCustomSkillInput('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Max size is 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarUrl(dataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || !user?.uid) return;
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const updateData: any = {
        name,
        bio,
        skills: selectedSkills,
        avatarUrl,
      };

      if (isAdmin) {
        updateData.role = role;
      }

      await updateDoc(doc(firestore, 'members', user.uid), updateData);
      setSuccess('Profile credentials successfully updated!');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to update credentials.');
    } finally {
      setLoading(false);
    }
  };

  if (memberLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Icon name="loading" className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Accessing credentials...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top navigation row */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <button
          onClick={() => router.push('/dashboard')}
          id="btn-back-to-dashboard"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-foreground text-xs font-mono uppercase tracking-wider transition-colors"
        >
          <Icon name="arrow-left-md" className="h-3.5 w-3.5" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <span className="text-[10px] font-mono font-bold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded uppercase tracking-wider">
              Admin Mode
            </span>
          )}
        </div>
      </div>

      <Card className="border border-border bg-card shadow-sm rounded-xl overflow-hidden transition-all duration-300">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle className="text-xl font-headline font-bold tracking-tight text-foreground uppercase">
            Edit Profile Credentials
          </CardTitle>
          <CardDescription className="text-xs uppercase tracking-widest text-primary font-mono mt-1">
            Maintain your specialist identity on the card roster
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="p-6 space-y-6">
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3 text-xs text-red-500 font-mono">
                <Icon name="shield-warning" className="h-4 w-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3.5 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3 text-xs text-green-600 font-mono">
                <Icon name="check" className="h-4 w-4 shrink-0 text-green-600" />
                <span>{success}</span>
              </div>
            )}

            {/* Profile Avatar Upload */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Profile Photo</label>
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-border bg-muted/20">
                <div className="relative group w-20 h-20 rounded-full border border-border overflow-hidden flex-shrink-0 bg-background flex items-center justify-center shadow-inner">
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Avatar Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon name="user" className="h-8 w-8 text-muted-foreground/30" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Icon name="camera" className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="space-y-2 flex-1 text-center sm:text-left w-full">
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <label className="cursor-pointer">
                      <span className="inline-flex items-center justify-center rounded-md text-[10px] font-mono font-bold uppercase tracking-wider h-8 px-3 border border-border bg-background hover:bg-muted text-foreground transition-all select-none shadow-sm">
                        <Icon name="file-upload" className="mr-1.5 h-3.5 w-3.5" /> Upload File
                      </span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        id="input-avatar-file"
                        className="hidden" 
                        onChange={handleFileChange}
                      />
                    </label>
                    {avatarUrl && (
                      <button
                        type="button"
                        id="btn-clear-avatar"
                        onClick={() => setAvatarUrl('')}
                        className="inline-flex items-center justify-center rounded-md text-[10px] font-mono font-bold uppercase tracking-wider h-8 px-3 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-all shadow-sm"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase font-mono">JPG, PNG up to 5MB. Auto-cropped to 150x150.</p>
                </div>
              </div>
            </div>

            {/* Profile Info Fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Name / Alias</label>
                <Input 
                  type="text" 
                  id="input-profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background border-border text-foreground"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest flex items-center justify-between">
                  <span>Title / Role</span>
                  {!isAdmin && (
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      🔒 Admin Lock
                    </span>
                  )}
                </label>
                <Input 
                  type="text" 
                  id="input-profile-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={!isAdmin}
                  className={cn(
                    "border-border font-medium",
                    isAdmin ? "bg-background text-foreground" : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                  )}
                  required
                />
              </div>
            </div>

            {/* Profile Bio */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Mission Bio / Card Description</label>
              <Textarea 
                placeholder="Briefly state your specialization, engineering principles, or bio details displayed on your agent card..." 
                id="textarea-profile-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="bg-background border-border min-h-[100px] text-foreground leading-relaxed"
                required
              />
            </div>

            {/* Profile Technical Skills */}
            <div className="space-y-2.5">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Technical Arsenal (Select Tools)</label>
              <div className="flex flex-wrap gap-1.5 p-3.5 rounded-xl border border-border bg-muted/10 min-h-[140px] shadow-inner">
                {[...PREDEFINED_SKILLS, ...customSkills].map((skill) => {
                  const isSelected = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      id={`btn-skill-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      onClick={() => toggleSkill(skill)}
                      className={cn(
                        "flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase transition-all duration-200 border shadow-sm",
                        isSelected 
                          ? "bg-primary/10 text-primary border-primary/40 font-bold" 
                          : "bg-background border-border text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted"
                      )}
                    >
                      {SKILL_ICONS[skill]}
                      {skill}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Skill Tool */}
              <div className="flex gap-2">
                <Input 
                  type="text" 
                  id="input-custom-skill"
                  placeholder="Add custom skills / tools..." 
                  value={customSkillInput}
                  onChange={(e) => setCustomSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomSkill();
                    }
                  }}
                  className="bg-background border-border flex-1 text-foreground"
                />
                <Button 
                  type="button" 
                  id="btn-add-custom-skill"
                  onClick={handleAddCustomSkill}
                  className="bg-primary hover:bg-primary/90 text-white h-9 w-9 p-0 flex items-center justify-center shrink-0 border border-border"
                >
                  <Icon name="plus" className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="border-t border-border bg-muted/10 px-6 py-4 flex justify-end">
            <Button 
              type="submit" 
              id="btn-save-credentials"
              className="bg-primary hover:bg-primary/95 text-white font-headline text-xs tracking-widest uppercase py-2 px-6"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Icon name="loading" className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : 'Save Updates'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
