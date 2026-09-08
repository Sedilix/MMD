"use client"

import { useState, useEffect, Suspense } from 'react';
import { Icon } from '@/components/ui/icon';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import { useRoster } from '@/hooks/use-roster';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { RatesDialogContent, TermsDialogContent, NdaDialogContent } from './legal-dialogs';
import { Sparkles, Cpu } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { 
  SiReact, SiTypescript, SiNextdotjs, SiPython, SiFirebase, 
  SiTailwindcss, SiNodedotjs, SiKubernetes, SiDocker, SiGooglecloud, 
  SiGo, SiRust, SiPostgresql, SiGraphql 
} from 'react-icons/si';
import { FaBrain, FaNetworkWired, FaRobot, FaAws } from 'react-icons/fa6';


export default function InitializeSpecialistPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [primaryDiv, setPrimaryDiv] = useState<string | null>(null);
  const [secondaryDiv, setSecondaryDiv] = useState<string | null>(null);
  const [interestDiv, setInterestDiv] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Technical specs (Ben's work)
  const [role, setRole] = useState('');
  const [bio, setBio] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState('');

  // Non-technical intake fields
  const [careAbout, setCareAbout] = useState('');
  const [workingHabit, setWorkingHabit] = useState('Standard Hours');
  const [aiComfort, setAiComfort] = useState('Comfortable / Active User');
  const [repoLink, setRepoLink] = useState('');
  const [ratesAccepted, setRatesAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [websiteConfirm, setWebsiteConfirm] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Inline validation errors
  const [photoError, setPhotoError] = useState('');
  const [agreementError, setAgreementError] = useState('');
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();


  const DIVISIONS = [
    {
      id: 'ai-systems',
      title: 'AI & Systems',
      description: 'Build the core platforms. We need Systems Architects to design and orchestrate reliable, high-performance applications. We seek Machine Learning Engineers experienced in training, fine-tuning, and deploying modern AI systems and LLMs for enterprise use-cases.',
      icon: <Image src="/AIdiv.png" alt="AI & Systems" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    },
    {
      id: 'marketing',
      title: 'Marketing',
      description: 'Drive the technical narrative. We need Technical Product Marketers to craft elite B2B campaigns that resonate with top-tier founders and enterprise executives. We seek Growth Strategists and Copywriters experienced in transforming complex zero-egress concepts, decentralized platforms, and client products into compelling, high-conversion growth engines.',
      icon: <Image src="/MarketingDiv.png" alt="Marketing" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    },
    {
      id: 'ui-ux',
      title: 'UI / UX',
      description: 'Architect the visual experience. We need UX/UI Designers to wireframe and design premium, responsive interfaces utilizing modern design principles. We seek Frontend Developers (React/Next.js) capable of implementing seamless interactions and delivering an exceptional user experience for high-stakes client deployments.',
      icon: <Image src="/UIUX.png" alt="UI / UX" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    },
    {
      id: 'security',
      title: 'Cybersecurity',
      description: 'Secure our infrastructure. We need Security Engineers to conduct advanced threat modeling, vulnerability assessments, and secure code reviews. We seek DevSecOps Specialists experienced in engineering secure cloud environments, enforcing strict access controls, and ensuring data privacy for enterprise applications.',
      icon: <Image src="/Security.png" alt="Cybersecurity" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    },
    {
      id: 'integrations',
      title: 'Integrations',
      description: 'Connect our systems. We need Data Pipeline Engineers to build robust ETL flows, reliable data extractors, and complex third-party API integrations to securely feed structured environments. We seek Backend Integration Specialists to act as the technical bridge between external services and secure data platforms.',
      icon: <Image src="/Integrations.png" alt="Integrations" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    },
    {
      id: 'growth',
      title: 'Business Growth',
      description: 'Scale the collective. We need Strategic Account Executives to identify high-value B2B targets, forge enterprise alliances, and close critical partnerships. We seek Business Development Representatives (BDRs) experienced in executing high-leverage outreach campaigns to rapidly expand the Cybrdeck footprint and advise clients on scaling operations.',
      icon: <Image src="/Growth.png" alt="Business Growth" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
    },
    {
      id: 'hardware',
      title: 'Hardware Solutions/Integration',
      description: 'Build physical solutions. We need PCB Layout & Schematic Engineers to design complex production layouts (KiCad/EasyEDA) and ensure flawless signal integrity. We seek Embedded Firmware Developers (C/C++) experienced with advanced SoCs, audio DSP, micro-electronics, and secure hardware integrations. For large-scale deployments, you will act as a strategic consultant—collaborating with our hardware partners to architect robust infrastructure and guide clients through complex AI integrations.',
      icon: <Image src="/Hardware.png" alt="Hardware Solutions/Integration" width={48} height={48} className="mb-4 mx-auto object-contain drop-shadow-[0_0_8px_rgba(198,143,61,0.5)]" />
    }
  ];

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
    
    // Add to customSkills list if not already there (predefined or custom)
    const allAvailable = [...PREDEFINED_SKILLS, ...customSkills];
    if (!allAvailable.includes(trimmed)) {
      setCustomSkills(prev => [...prev, trimmed]);
    }

    // Select the skill by default if not already selected
    if (!selectedSkills.includes(trimmed)) {
      setSelectedSkills(prev => [...prev, trimmed]);
    }
    setCustomSkillInput('');
  };

  // If user is already authenticated, advance directly to step 3 (skip credential entry)
  useEffect(() => {
    if (user && (step === 2 || step === 1)) {
      const emailName = user.email?.split('@')[0] || '';
      setName(emailName.charAt(0).toUpperCase() + emailName.slice(1));
      setStep(3);
      setLoading(false);
    }
  }, [user, step]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    const emailName = email.split('@')[0] || '';
    setName(emailName.charAt(0).toUpperCase() + emailName.slice(1));
    setStep(3);
  };

  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await setPersistence(auth, browserSessionPersistence);
      const result = await signInWithPopup(auth, provider);
      const userEmail = result.user.email;
      if (userEmail) {
        localStorage.setItem(`cybrdeck_app_status_${userEmail}`, 'not_applied');
        localStorage.setItem('cybrdeck_last_email', userEmail);
      }
      // Auth change triggers useEffect to advance to Step 2
    } catch (err: any) {
      if (err?.code === 'auth/popup-blocked' || err?.message?.includes('popup-blocked')) {
        try {
          // Fallback to redirect for mobile/in-app browsers
          await signInWithRedirect(auth, provider);
        } catch (redirectErr: any) {
          setError(redirectErr?.message || 'Redirect authentication failed');
          setLoading(false);
        }
      } else {
        setError(err?.message || 'Google authentication failed');
        setLoading(false);
      }
    }
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

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user && !email) return;

    // Inline validation — clear previous errors first
    setPhotoError('');
    setAgreementError('');
    setError('');

    let hasInlineError = false;
    if (!avatarUrl) {
      setPhotoError('A profile photo is required before submitting.');
      hasInlineError = true;
    }
    if (!ratesAccepted || !termsAccepted || !ndaAccepted) {
      setAgreementError('Please accept all three agreements before submitting.');
      hasInlineError = true;
    }
    if (hasInlineError) return;

    setLoading(true);
    
    const formattedBio = `${bio || 'N/A'}\n\nPersonality Profile:\n${careAbout}`;
    const compiledSkills = [
      ...selectedSkills
    ];
    const selectedRolesList = [];
    if (primaryDiv) selectedRolesList.push(`Primary: ${primaryDiv}`);
    if (secondaryDiv) selectedRolesList.push(`Secondary: ${secondaryDiv}`);
    if (interestDiv) selectedRolesList.push(`Interest: ${interestDiv}`);
    const computedRole = `${selectedRolesList.join(' | ')} - ${role || 'Specialist Candidate'}`;

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('email', email || user?.email || '');
      formData.append('role', computedRole);
      formData.append('bio', formattedBio);
      formData.append('skills', JSON.stringify(compiledSkills));
      formData.append('avatarUrl', avatarUrl || '');
      formData.append('website_confirm', websiteConfirm);
      if (resumeFile) {
        formData.append('resume', resumeFile);
      }

      const response = await fetch('/api/apply', {
        method: 'POST',
        body: formData
      });

      const responseText = await response.text();

      if (!response.ok) {
        let errorMessage = `Server error (${response.status})`;
        try {
          const result = JSON.parse(responseText);
          errorMessage = result.error || errorMessage;
        } catch {
          // Response wasn't JSON — use status text
          errorMessage = responseText.substring(0, 200) || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const result = JSON.parse(responseText);

      // Prevent persisting the session for new applicants
      if (auth) {
        await signOut(auth);
      }

      const userEmail = email || user?.email || '';
      if (userEmail) {
        localStorage.setItem(`cybrdeck_app_status_${userEmail}`, 'applied');
      }

      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit intake application details');
      setLoading(false);
    }
  };



  return (
    <div className="min-h-dvh flex items-center justify-center p-0 sm:p-6 bg-zinc-900 relative overflow-hidden dark">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="fixed top-4 left-4 sm:top-5 sm:left-5 z-50 flex items-center justify-center sm:justify-start gap-0 sm:gap-2 w-10 h-10 sm:w-auto sm:h-9 sm:px-4 rounded-full sm:rounded-md border border-[#ffffff] bg-[#000000] hover:bg-zinc-900 text-[#ffffff] transition-all duration-200 font-mono text-sm uppercase tracking-widest group"
      >
        <Icon name="arrow-left-md" className="h-5 w-5 sm:h-4 sm:w-4 group-hover:-translate-x-0.5 transition-transform" />
        <span className="hidden sm:inline">Back</span>
      </button>

      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/15 blur-[120px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/15 blur-[120px] rounded-full" />
      </div>

      <Card className="w-full min-h-dvh sm:min-h-0 max-w-6xl rounded-none sm:rounded-xl border border-zinc-800/80 bg-[#121316]/85 backdrop-blur-xl text-slate-200 relative overflow-hidden flex flex-col shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        {/* Progress header bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/5 flex">
          <div className={`h-full bg-primary transition-all duration-500 ${step === 1 ? 'w-1/4' : step === 2 ? 'w-2/4' : step === 3 ? 'w-3/4' : 'w-full'}`} />
        </div>

        <CardHeader className="text-center pt-8">
          <div className="flex justify-center mb-4">
            <Image 
              src="/cybrdeck-logo/cybrdeck_logo_cropped_white.png"
                alt="Cybrdeck Logo"
                width={400}
                height={80}
                className="h-8 md:h-10 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                priority 
            />
          </div>
          <h1 className="text-3xl font-headline font-bold tracking-tight text-[#E2E8F0] uppercase">
            {step === 1 ? 'SELECT DIVISION' : step === 2 ? 'SPECIALIST RECRUITMENT INIT' : 'INTAKE PROFILE'}
          </h1>
          <CardDescription className="text-sm uppercase tracking-widest text-primary font-mono mt-1">
            {step === 1 ? 'Step 1 of 3: Target Designation' : step === 2 ? 'Step 2 of 3: Create Core Credentials' : 'Step 3 of 3: Specialist Alignment Form'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3 text-sm text-red-400 font-mono animate-in fade-in duration-300">
              <Icon name="shield-warning" className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          
          {step === 1 ? (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar pb-12 sm:pb-0">
              <div className="text-center space-y-2 mb-6">
                <p className="text-base text-slate-400 font-headline uppercase font-bold tracking-wider">Choose your Primary, Secondary and Interest</p>
                <p className="text-sm text-white font-mono max-w-2xl mx-auto">
                  * While the division descriptions highlight specific target profiles, talent transcends titles. We welcome applications from specialists with demonstrated ability across any subset of these domains.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DIVISIONS.map((div) => {
                  const isPrimary = primaryDiv === div.title;
                  const isSecondary = secondaryDiv === div.title;
                  const isInterest = interestDiv === div.title;

                  let cardBgClass = "bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700";
                  let titleColorClass = "text-slate-200";
                  let shadowClass = "";

                  if (isPrimary) {
                    cardBgClass = "bg-[#2092A9]/10 border-[#2092A9] border-2";
                    titleColorClass = "text-[#48e5ff]";
                    shadowClass = "shadow-[0_0_15px_rgba(32,146,169,0.3)]";
                  } else if (isSecondary) {
                    cardBgClass = "bg-[#6029CF]/10 border-[#6029CF] border-2";
                    titleColorClass = "text-[#a882ff]";
                    shadowClass = "shadow-[0_0_15px_rgba(96,41,207,0.3)]";
                  } else if (isInterest) {
                    cardBgClass = "bg-[#DE36F5]/10 border-[#DE36F5] border-2";
                    titleColorClass = "text-[#F08CFF]";
                    shadowClass = "shadow-[0_0_15px_rgba(222,54,245,0.3)]";
                  }

                  return (
                    <div
                      key={div.id}
                      className={cn(
                        "p-6 sm:p-8 rounded-xl border text-center transition-all duration-200 flex flex-col items-center h-full text-left",
                        cardBgClass,
                        shadowClass
                      )}
                    >
                      {div.icon}
                      <h4 className={cn("font-headline font-bold uppercase tracking-widest text-lg mb-3", titleColorClass)}>{div.title}</h4>
                      <p className="text-base text-slate-400 leading-relaxed flex-1 text-center">{div.description}</p>
                      
                      <div className="mt-5 pt-4 border-t border-white/5 w-full flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isPrimary) {
                              setPrimaryDiv(null);
                            } else {
                              setPrimaryDiv(div.title);
                              if (secondaryDiv === div.title) setSecondaryDiv(null);
                              if (interestDiv === div.title) setInterestDiv(null);
                            }
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider transition-all border cursor-pointer",
                            isPrimary
                              ? "bg-[#2092A9] text-white border-[#2092A9]"
                              : "bg-zinc-900 border-zinc-700 text-slate-300 hover:bg-zinc-800"
                          )}
                        >
                          Primary
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isSecondary) {
                              setSecondaryDiv(null);
                            } else {
                              setSecondaryDiv(div.title);
                              if (primaryDiv === div.title) setPrimaryDiv(null);
                              if (interestDiv === div.title) setInterestDiv(null);
                            }
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider transition-all border cursor-pointer",
                            isSecondary
                              ? "bg-[#6029CF] text-white border-[#6029CF]"
                              : "bg-zinc-900 border-zinc-700 text-slate-300 hover:bg-zinc-800"
                          )}
                        >
                          Secondary
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isInterest) {
                              setInterestDiv(null);
                            } else {
                              setInterestDiv(div.title);
                              if (primaryDiv === div.title) setPrimaryDiv(null);
                              if (secondaryDiv === div.title) setSecondaryDiv(null);
                            }
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider transition-all border cursor-pointer",
                            isInterest
                              ? "bg-[#DE36F5] text-white border-[#DE36F5]"
                              : "bg-zinc-900 border-zinc-700 text-slate-300 hover:bg-zinc-800"
                          )}
                        >
                          Interest
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <Button 
                onClick={() => setStep(2)} 
                className="w-full h-14 bg-[#000000] hover:bg-zinc-900 text-[#ffffff] border border-[#ffffff] font-headline text-base tracking-widest mt-8 uppercase"
                disabled={!primaryDiv}
              >
                Confirm Designation <Icon name="chevron-right" className="ml-2 h-5 w-5" />
              </Button>
            </div>
          ) : step === 2 ? (

            <div className="space-y-6">
              <Button 
                onClick={handleGoogleSignIn} 
                className="w-full h-12 border border-[#ffffff] bg-[#000000] hover:bg-zinc-900 text-[#ffffff] font-headline text-sm tracking-widest gap-2"
                disabled={loading}
              >
                {loading ? <Icon name="loading" className="h-4 w-4 animate-spin" /> : (
                  <>
                    <svg className="h-4 w-4" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    LINK GOOGLE ACCOUNT
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                  <span className="px-2 font-bold bg-[#121316] text-zinc-500">OR OTHER EMAILS...</span>
                </div>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-mono text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                  <Input 
                    type="email" 
                    placeholder="spec@cybrdeck.com" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="!bg-zinc-900/50 !text-slate-200 !border-zinc-800 placeholder:!text-zinc-400 h-12"
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full h-12 bg-[#000000] hover:bg-zinc-900 text-[#ffffff] border border-[#ffffff] font-headline text-sm tracking-widest" disabled={loading}>
                  {loading ? <Icon name="loading" className="h-5 w-5 animate-spin" /> : 'CONTINUE TO PROFILE'}
                </Button>
              </form>
            </div>
          ) : step === 3 ? (
            <form onSubmit={handleProfileSubmit} className="space-y-5 text-left flex-1 sm:max-h-[70vh] overflow-y-auto pr-2 pb-12 sm:pb-0 custom-scrollbar">
              {/* Honeypot field for bot prevention */}
              <div style={{ display: 'none' }} aria-hidden="true">
                <input 
                  type="text" 
                  name="website_confirm" 
                  value={websiteConfirm} 
                  onChange={(e) => setWebsiteConfirm(e.target.value)} 
                  tabIndex={-1} 
                  autoComplete="off" 
                />
              </div>

              {/* Profile Photo Selector (Ben's Work) */}
              <div className="space-y-2">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Select Profile Photo (Required)</label>
                <div className={`flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border bg-zinc-900/40/50 transition-colors ${
                  photoError ? 'border-red-400 bg-red-50/50' : 'border-zinc-800'
                }`}>
                  <div className="relative group w-16 h-16 rounded-full border border-primary/20 overflow-hidden flex-shrink-0 bg-zinc-900 flex items-center justify-center">
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt="Avatar Preview" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Icon name="user" className="h-6 w-6 text-slate-400/30" />
                    )}
                  </div>
                  <div className="space-y-2 flex-1 text-center sm:text-left w-full">
                    <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center justify-center rounded-md text-[10px] font-mono font-bold uppercase tracking-wider h-8 px-3 border !border-zinc-800 hover:!bg-zinc-900/40 !bg-zinc-900/50 !text-slate-200 transition-all select-none">
                          <Icon name="file-upload" className="mr-1.5 h-3 w-3" /> Upload File
                        </span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => { setPhotoError(''); handleFileChange(e); }}
                        />
                      </label>
                      {avatarUrl && (
                        <button
                          type="button"
                          onClick={() => setAvatarUrl('')}
                          className="inline-flex items-center justify-center rounded-md text-[10px] font-mono font-bold uppercase tracking-wider h-8 px-3 border border-red-500/30 hover:border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {photoError && (
                      <p className="text-[10px] text-red-500 font-mono mt-1">{photoError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Name field */}
              <div className="space-y-1.5">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Alias or Full Name</label>
                <Input 
                  type="text" 
                  placeholder="e.g. Neo" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="!bg-zinc-900/50 !border-white/10 hover:!border-white/20 focus:!border-primary/50 h-11 text-base !text-slate-200 placeholder:!text-zinc-400 transition-all"
                  required
                />
              </div>

              {/* Role field (Ben's Work) */}
              <div className="space-y-1.5">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Specialization / Primary Role</label>
                <Input 
                  type="text" 
                  placeholder="e.g. AI Integration Architect" 
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="!bg-zinc-900/50 !border-white/10 hover:!border-white/20 focus:!border-primary/50 h-11 text-base !text-slate-200 placeholder:!text-zinc-400 transition-all"
                  required
                />
              </div>

              {/* Public repos link */}
              <div className="space-y-1.5">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Link to Public Code Repositories (Optional)</label>
                <Input 
                  type="url" 
                  placeholder="e.g. https://github.com/your-username" 
                  value={repoLink}
                  onChange={(e) => setRepoLink(e.target.value)}
                  className="!bg-zinc-900/50 !border-white/10 hover:!border-white/20 focus:!border-primary/50 h-11 text-base !text-slate-200 placeholder:!text-zinc-400 transition-all"
                />
              </div>

              {/* Resume/CV Upload (New Container) */}
              <div className="space-y-1.5">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Upload Resume / CV / Project Deck</label>
                <span className="block text-[9px] !text-slate-400 font-mono -mt-1 ml-1 uppercase">Supports PDF, DOC, DOCX, PPT, PPTX up to 4.5MB</span>
                <div 
                  className={cn(
                    "border border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 min-h-[120px] text-center relative",
                    resumeFile ? "border-primary/50 !bg-primary/5" : "!border-zinc-800 !bg-zinc-900/40 hover:border-primary/50 hover:!bg-zinc-100/50"
                  )}
                >
                  <input 
                    type="file" 
                    accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 4.5 * 1024 * 1024) {
                        setError("File exceeds 4.5MB limit. Please upload a smaller file.");
                        return;
                      }
                      setError("");
                      setResumeFile(file);
                    }}
                  />
                  {resumeFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Icon name="check" className="h-5 w-5 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-mono font-bold text-slate-200 max-w-[250px] truncate">{resumeFile.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono uppercase">{(resumeFile.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setResumeFile(null);
                        }}
                        className="mt-2 inline-flex items-center justify-center rounded-md text-[10px] font-mono font-bold uppercase tracking-wider h-7 px-3 border border-red-500/30 hover:border-red-500 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all z-10"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 pointer-events-none">
                      <Icon name="file-upload" className="h-8 w-8 text-slate-400/50" />
                      <p className="text-sm font-mono font-bold !text-slate-200 uppercase">Drag & Drop or Click to Upload</p>
                      <p className="text-[9px] !text-slate-400 uppercase font-mono">Maximum File Size: 4.5MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Technical Skills Arsenal (Ben's Work) */}
              <div className="space-y-2">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Technical Arsenal (Select Tools)</label>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border !border-zinc-800 !bg-zinc-900/40 min-h-[150px]">
                  {[...PREDEFINED_SKILLS, ...customSkills].map((skill) => {
                    const isSelected = selectedSkills.includes(skill);
                    return (
                      <button
                        key={skill}
                        type="button"
                        onClick={() => toggleSkill(skill)}
                        className={cn(
                          "flex items-center px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase transition-all duration-200 border",
                          isSelected 
                            ? "!bg-primary/10 !text-primary !border-primary/40 shadow-sm font-bold" 
                            : "!bg-zinc-900/50 !border-white/10 !text-slate-300 hover:!border-white/20 hover:!bg-zinc-900/80"
                        )}
                      >
                        {SKILL_ICONS[skill]}
                        {skill}
                      </button>
                    );
                  })}
                </div>
                {/* Custom skill adder */}
                <div className="flex gap-2">
                  <Input 
                     type="text" 
                     placeholder="Add custom tools/skills..." 
                     value={customSkillInput}
                     onChange={(e) => setCustomSkillInput(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') {
                         e.preventDefault();
                         handleAddCustomSkill();
                       }
                     }}
                     className="!bg-zinc-900/50 !border-white/10 hover:!border-white/20 focus:!border-primary/50 h-9 focus-visible:ring-primary/50 flex-1 !text-slate-200 placeholder:!text-zinc-400 transition-all"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddCustomSkill}
                    className="bg-secondary hover:bg-secondary/90 text-white h-9 w-9 p-0 flex items-center justify-center shrink-0 border border-secondary/20"
                  >
                    <Icon name="plus" className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Bio textarea (Ben's Work) */}
              <div className="space-y-1.5">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Professional Bio</label>
                <Textarea 
                  placeholder="Tell us about your technical capabilities, past builds, and engineering philosophy..." 
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="!bg-zinc-900/50 !border-white/10 hover:!border-white/20 focus:!border-primary/50 min-h-[80px] text-base leading-relaxed !text-slate-200 placeholder:!text-zinc-400 transition-all"
                  required
                />
              </div>

              {/* Motivation profile textarea */}
              <div className="space-y-1.5">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Motivation & Caring Profile</label>
                <span className="block text-[9px] !text-slate-400 font-mono -mt-1 ml-1 uppercase">What do you care about? What kind of person are you? (Non-technical)</span>
                <Textarea 
                  placeholder="Explain what matters to you, your core values, your operational philosophy, and the kind of teammate you are..." 
                  value={careAbout}
                  onChange={(e) => setCareAbout(e.target.value)}
                  className="!bg-zinc-900/50 !border-white/10 hover:!border-white/20 focus:!border-primary/50 min-h-[80px] text-base leading-relaxed !text-slate-200 placeholder:!text-zinc-400 transition-all"
                  required
                />
              </div>

              {/* Application Notice */}
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2 shadow-[0_0_15px_rgba(232,79,255,0.03)] animate-in fade-in duration-300">
                <h4 className="text-sm font-mono text-primary font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  <span>Application Review Process</span>
                </h4>
                <p className="text-sm !text-slate-300 leading-relaxed font-body">
                  Please be authentic and detailed. Your profile, motives, and working habits are reviewed by our team. We are looking for high cultural alignment and a strong technical background. If your profile is a strong fit, you will receive next-step instructions.
                </p>
              </div>

              {/* Working habits selection (Radio styles) */}
              <div className="space-y-2">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">Working Hours & Habits</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Morning/Early', 'Standard Hours', 'Flexible/Evening'].map((habit) => {
                    const active = workingHabit === habit;
                    return (
                      <button
                        key={habit}
                        type="button"
                        onClick={() => setWorkingHabit(habit)}
                        className={cn(
                          "py-2.5 rounded-lg border text-center font-headline text-[9px] tracking-wider uppercase transition-all duration-200 cursor-pointer",
                          active
                            ? "!bg-primary/10 !border-primary/30 !text-primary shadow-sm font-bold"
                            : "!bg-zinc-900/50 !border-white/10 !text-slate-300 hover:!border-white/20 hover:!bg-zinc-900/80 hover:!text-slate-200 transition-all"
                        )}
                      >
                        {habit}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AI comfort level selection */}
              <div className="space-y-2">
                <label className="text-sm font-mono !text-slate-400 uppercase tracking-widest ml-1">AI Integration Comfort Level</label>
                <div className="space-y-1.5">
                  {[
                    'Skeptical / Minimal Usage',
                    'Comfortable / Active User',
                    'Power User / AI Native'
                  ].map((level) => {
                    const active = aiComfort === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setAiComfort(level)}
                        className={cn(
                          "w-full py-2.5 px-3 rounded-lg border text-left font-headline text-[9px] tracking-wider uppercase transition-all duration-200 cursor-pointer flex items-center justify-between",
                          active
                            ? "!bg-primary/10 !border-primary/30 !text-primary shadow-sm font-bold"
                            : "!bg-zinc-900/50 !border-white/10 !text-slate-300 hover:!border-white/20 hover:!bg-zinc-900/80 hover:!text-slate-200 transition-all"
                        )}
                      >
                        <span>{level}</span>
                        {active && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Compensation Rates Acknowledgment Box */}
              <div className={`p-4 rounded-xl border space-y-4 transition-colors ${
                agreementError ? 'bg-red-50/70 border-red-300' : 'bg-zinc-900/40 border-zinc-800'
              }`}>
                <div className="space-y-1">
                  <h4 className="text-sm font-mono text-slate-200 font-bold uppercase tracking-wider">🔒 CONTRACTING, COMPENSATION & LEGAL COMPLIANCE</h4>
                   <p className="text-sm text-slate-400 leading-relaxed font-body">
                    All onboarded specialists are contracted under our secure parent entity at attractive rates depending on tier and performance multipliers.
                  </p>
                </div>
                <div className="space-y-3 pt-2 border-t border-zinc-800">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={ratesAccepted}
                      onChange={(e) => { setRatesAccepted(e.target.checked); setAgreementError(''); }}
                      className="w-4 h-4 accent-primary border border-zinc-300 rounded focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                    />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                      I acknowledge and accept the{' '}
                      <Dialog>
                        <DialogTrigger onClick={(e) => e.stopPropagation()} className="text-slate-200 hover:underline font-bold uppercase">
                          Standard Rates (View Matrix Here)
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto bg-[#121316] text-slate-200 border-zinc-800">
                          <DialogHeader>
                            <DialogTitle className="font-headline tracking-widest uppercase">Cybrdeck Agent Compensation & Rate Matrix</DialogTitle>
                            <DialogDescription>
                              Please review our compensation structure, bonuses, and compliance terms.
                            </DialogDescription>
                          </DialogHeader>
                          <RatesDialogContent />
                        </DialogContent>
                      </Dialog>
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => { setTermsAccepted(e.target.checked); setAgreementError(''); }}
                      className="w-4 h-4 accent-primary border border-zinc-300 rounded focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                    />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                      By submitting this application, I Agree & Consent to Eve Count Holdings and/or Cybrdeck&apos;s{' '}
                      <Dialog>
                        <DialogTrigger onClick={(e) => e.stopPropagation()} className="text-slate-200 hover:underline font-bold uppercase">
                          Terms & Conditions
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[#121316] text-slate-200 border-zinc-800">
                          <DialogHeader>
                            <DialogTitle className="font-headline tracking-widest uppercase">Eve Count Holdings & Cybrdeck Specialist Application Terms & Conditions</DialogTitle>
                            <DialogDescription>
                              Please read carefully before submitting your application.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 text-base text-[#E2E8F0]/80 font-body">
                            <p><strong>CYBRDECK TERMS AND CONDITIONS</strong></p>
                            
                            <p><strong>1. INTRODUCTION AND PARTIES</strong></p>
                            <p>These Terms and Conditions (&quot;Terms&quot;) form a legally binding agreement between you (&quot;User&quot;) and Cybrdeck, a subsidiary of Eve Count Holdings (&quot;Company,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). These Terms apply to all users of the Cybrdeck platform, including individuals providing services (&quot;Agents&quot;) and entities or individuals requesting services (&quot;Clients&quot;). By accessing the Cybrdeck website (https://cybrdeck.com) or clicking &quot;I agree&quot; during the application or registration process, you signify your acceptance of these Terms, the Privacy Policy, and any applicable Non-Disclosure Agreements (NDAs).</p>
                            
                            <p><strong>2. PLATFORM SERVICE MODEL</strong></p>
                            <p>Cybrdeck provides an AI-driven digital platform designed to facilitate the matching of Agents with Clients for project-based work.</p>
                            <ul className="list-disc pl-5 space-y-1">
                              <li><strong>a. AI Matching Disclaimer:</strong> The platform utilizes proprietary AI algorithms to suggest Agents based on project requirements. Cybrdeck acts solely as a technical facilitator. We do not guarantee the accuracy, suitability, availability, or outcome of any AI-generated agent-client match.</li>
                              <li><strong>b. No Employment Relationship:</strong> Agents operate as independent contractors. Nothing in these Terms creates an employment, agency, or partnership relationship between Cybrdeck (or Eve Count Holdings) and the Agent.</li>
                            </ul>
                            
                            <p><strong>3. OBLIGATIONS AND WORK TERMS</strong></p>
                            <ul className="list-disc pl-5 space-y-1">
                              <li><strong>a. Agents:</strong> You are solely responsible for your own work quality, local tax compliance, and adherence to project deadlines. You must maintain professional standards in remote service delivery.</li>
                              <li><strong>b. Clients:</strong> You are responsible for defining project scope and facilitating payment.</li>
                              <li><strong>c. In-Person Requirements:</strong> While Cybrdeck operates as a remote platform, should a Client require face-to-face consultation, the Agent and Client are solely responsible for negotiating terms, safety, and expenses. Cybrdeck bears no liability for these arrangements.</li>
                            </ul>
                            
                            <p><strong>4. PAYMENT AND INTELLECTUAL PROPERTY</strong></p>
                            <ul className="list-disc pl-5 space-y-1">
                              <li><strong>a. Payment:</strong> Agents are compensated on an hourly basis. Cybrdeck serves as the payment processor. Payment obligations are settled between the Client and the Agent via the platform.</li>
                              <li><strong>b. IP Assignment:</strong> Upon full payment by the Client, all intellectual property rights for work products created during the engagement shall vest in the Client, unless otherwise specified in a separate project agreement.</li>
                            </ul>
                            
                            <p><strong>5. LIMITATION OF LIABILITY</strong></p>
                            <p>To the fullest extent permitted by the laws of Singapore, Cybrdeck and Eve Count Holdings shall not be liable for any direct, indirect, incidental, or consequential damages resulting from the use of the platform, the quality of services provided by Agents, or any disputes between Agents and Clients. Cybrdeck is an intermediary and disclaims all liability for the conduct of its users.</p>
                            
                            <p><strong>6. GOVERNING LAW AND DISPUTE RESOLUTION</strong></p>
                            <p>These Terms are governed by the laws of Singapore. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts of Singapore.</p>
                            
                            <p><strong>7. ELECTRONIC ACCEPTANCE</strong></p>
                            <p>This Agreement does not require a handwritten signature. By clicking &quot;I agree&quot; during the online application process, acknowledging acceptance of Eve Count Holdings / Cybrdeck&apos;s Terms &amp; Conditions, Privacy Policy, and this NDA, the Recipient provides valid and legally binding acceptance of this Agreement.</p>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={ndaAccepted}
                      onChange={(e) => setNdaAccepted(e.target.checked)}
                      className="w-4 h-4 accent-primary border border-zinc-300 rounded focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                      required
                    />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                      I acknowledge and agree to be bound by the terms of the{' '}
                      <Dialog>
                        <DialogTrigger onClick={(e) => e.stopPropagation()} className="text-slate-200 hover:underline font-bold uppercase">
                          Non-Disclosure Agreement (NDA)
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[#121316] text-slate-200 border-zinc-800">
                          <DialogHeader>
                            <DialogTitle className="font-headline tracking-widest uppercase">Eve Count Holdings & Cybrdeck Non-Disclosure Agreement</DialogTitle>
                            <DialogDescription>
                              Please review the confidentiality terms carefully.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 text-base text-[#E2E8F0]/80 font-body">
                            <p><strong>NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT</strong></p>
                            <p>This Non-Disclosure Agreement (the &quot;Agreement&quot;), effective as of the date of electronic acceptance via the Company&apos;s online application process (the &quot;Effective Date&quot;), is entered into by and between Cybrdeck (the &quot;Company&quot;) and the applicant (&quot;Recipient&quot;).</p>
                            
                            <p><strong>1. Purpose</strong></p>
                            <p>The Recipient is interested in applying for a position with the Company. To facilitate the application and onboarding process following the Recipient&apos;s digital acceptance of this Agreement, the Company may disclose certain confidential and proprietary information to the Recipient.</p>
                            
                            <p><strong>2. Confidential Information</strong></p>
                            <p>&quot;Confidential Information&quot; means all non-public, proprietary, or confidential information disclosed by the Company to the Recipient, whether orally, in writing, or by inspection of tangible objects.</p>
                            <p>Confidential Information shall specifically include, without limitation:</p>
                            <ul className="list-disc pl-5 space-y-1">
                              <li><strong>Project Information:</strong> All projects undertaken by the Company, including project names, types, scope, and objectives.</li>
                              <li><strong>Development &amp; Methodology:</strong> All development processes, development methods, proprietary workflows, and information gathering techniques.</li>
                              <li><strong>Market Intelligence:</strong> Market reach, market sight, market foresight, market coverage, and market capitalization data.</li>
                              <li><strong>Client &amp; Stakeholder Data:</strong> Any information concerning the Company&apos;s clients, partners, and their respective stakeholders.</li>
                              <li><strong>Business Strategy:</strong> Financial data, business plans, product roadmaps, and marketing strategies.</li>
                            </ul>
                            
                            <p><strong>3. Obligations of Recipient</strong></p>
                            <p>Upon electronic acceptance of this Agreement, the Recipient agrees to:</p>
                            <ul className="list-disc pl-5 space-y-1">
                              <li>Hold all Confidential Information in strict confidence and take all reasonable precautions to protect it.</li>
                              <li>Use the Confidential Information solely for the purpose of evaluating and participating in the Company&apos;s onboarding process.</li>
                              <li>Not disclose, publish, or otherwise disseminate any Confidential Information to any third party without the prior written consent of the Company.</li>
                              <li>Not reverse engineer, disassemble, or decompile any software or technology disclosed.</li>
                            </ul>
                            
                            <p><strong>4. Ownership</strong></p>
                            <p>All Confidential Information remains the exclusive property of Cybrdeck. Nothing in this Agreement grants the Recipient any license, interest, or rights in or to the Confidential Information.</p>
                            
                            <p><strong>5. Term and Termination</strong></p>
                            <p>The Recipient&apos;s obligations of confidentiality shall remain in effect indefinitely or until the information becomes publicly known through no fault of the Recipient. The Company may terminate the application process at its sole discretion at any time.</p>
                            
                            <p><strong>6. Remedies</strong></p>
                            <p>The Recipient acknowledges that any breach of this Agreement may cause irreparable harm to Cybrdeck, and the Company shall be entitled to seek injunctive relief in addition to any other remedies available at law.</p>
                            
                            <p><strong>7. Governing Law</strong></p>
                            <p>This Agreement shall be governed by and construed in accordance with the laws of Singapore and California, without regard to conflict of law principles.</p>
                            
                            <p><strong>8. Entire Agreement</strong></p>
                            <p>This Agreement constitutes the entire understanding between the parties regarding the subject matter hereof.</p>
                            <p>This Agreement does not require a handwritten signature. By clicking &quot;I agree&quot; during the online application process, acknowledging acceptance of Eve Count / Cybrdeck&apos;s Terms &amp; Conditions, Privacy Policy, and this NDA, the Recipient provides valid and legally binding acceptance of this Agreement.</p>
                          </div>
                        </DialogContent>
                      </Dialog>
                      {' '}set forth by Eve Count Holdings & Cybrdeck.
                    </span>
                  </label>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 bg-[#000000] hover:bg-zinc-900 text-[#ffffff] border border-[#ffffff] font-headline text-sm tracking-widest gap-2 uppercase" disabled={loading}>
                {loading ? <Icon name="loading" className="h-5 w-5 animate-spin" /> : (
                  <>
                    Submit Intake Application <Icon name="chevron-right" className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center border border-primary/50">
                <Icon name="check" className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-headline font-bold uppercase text-slate-200">Application Received</h3>
              <p className="text-center text-base text-slate-400 max-w-sm">
                Your profile specifications have been successfully compiled and transmitted. 
              </p>
              <Button onClick={() => router.push('/')} className="mt-4 bg-[#000000] hover:bg-zinc-900 text-[#ffffff] border border-[#ffffff]">
                RETURN TO GRID
              </Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-white/5 pt-6">
          {step === 1 || step === 2 ? (
            <p className="text-sm text-slate-400">
              Already registered? <Link href="/login" className="text-primary hover:underline uppercase font-bold ml-1">ACCESS LOGIN</Link>
            </p>
          ) : step === 3 ? (
            <div className="flex items-center gap-1 text-sm text-slate-400 uppercase">
              <Sparkles className="h-3 w-3 text-primary animate-pulse" />
              <span>We Will Contact You Soon</span>
            </div>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
