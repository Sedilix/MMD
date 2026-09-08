"use client";

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Member } from '@/hooks/use-roster';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Server, Layout, Cpu, Network, Box } from 'lucide-react';

const getSkillIcon = (skill: string) => {
  const s = skill.toLowerCase();
  if (s.includes('python') || s.includes('react') || s.includes('rust')) return <Icon name="code" className="w-3 h-3 mr-1 text-primary" />;
  if (s.includes('firebase') || s.includes('firestore') || s.includes('database')) return <Icon name="data" className="w-3 h-3 mr-1 text-primary" />;
  if (s.includes('systems') || s.includes('devops') || s.includes('infrastructure')) return <Server className="w-3 h-3 mr-1 text-primary" />;
  if (s.includes('ui/ux') || s.includes('design')) return <Layout className="w-3 h-3 mr-1 text-primary" />;
  if (s.includes('agi') || s.includes('rag') || s.includes('ai')) return <Cpu className="w-3 h-3 mr-1 text-primary" />;
  if (s.includes('matrix') || s.includes('network') || s.includes('security')) return <Network className="w-3 h-3 mr-1 text-primary" />;
  return <Box className="w-3 h-3 mr-1 text-primary" />;
};

const backgrounds = [
  '/ace_clubs_hollow.png',
  '/ace_diamonds_hollow.png',
  '/ace_hearts_hollow.png',
  '/ace_spades_hollow.png'
];

export function MemberCard({ member }: { member: Member }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Scrub legacy cyberpunk traces from the bio string
  let cleanBio = (member.bio || '')
    .replace(/MISSION PROFILE \/ BIO:\s*/ig, '')
    .replace(/CARE ABOUT \/ PERSONALITY PROFILE:\s*/ig, '\n\n')
    .replace(/AI COMFORT LEVEL:.*?(?:\n|$)/ig, '')
    .replace(/PUBLIC REPOSITORIES:.*?(?:\n|$)/ig, '')
    .trim();

  const shouldTruncate = cleanBio.length > 120;
  const displayBio = shouldTruncate && !isExpanded 
    ? `${cleanBio.slice(0, 115)}` 
    : cleanBio;

  // Filter out legacy form data packed into the skills array
  const displaySkills = member.skills.filter(skill => {
    const s = skill.toLowerCase();
    return !s.includes('working habit') && 
           !s.includes('ai comfort') && 
           !s.includes('repo link') && 
           !s.includes('rates:') &&
           !s.includes('terms:') &&
           !s.includes('nda:');
  });

  const bgIndex = (member.id.charCodeAt(member.id.length - 1) || 0) % 4;
  const bgImage = backgrounds[bgIndex];

  let finalBadge = '';
  if (member.name.toLowerCase() === 'sedilix') {
    finalBadge = 'Co-founder';
  } else if (member.name.toLowerCase() === 'one') {
    finalBadge = 'Conductor';
  } else {
    finalBadge = (member as any).tier || (
      member.completedProjects && member.completedProjects > 20 ? 'Elite' :
      member.completedProjects && member.completedProjects >= 5 ? 'Advanced' :
      'Initiate'
    );
  }

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case 'Co-founder': return 'bg-primary/20 text-primary border-primary/50 shadow-[0_0_10px_rgba(232,79,255,0.3)]';
      case 'Conductor': return 'bg-red-500/20 text-red-500 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.3)]';
      case 'Elite': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30 shadow-[0_0_8px_rgba(234,179,8,0.2)]';
      case 'Advanced': return 'bg-brand-500/10 text-brand-500 border-brand-500/30 shadow-[0_0_8px_rgba(198,143,61,0.2)]';
      case 'Initiate': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
      default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
    }
  };

  return (
    <div className="relative p-[1.5px] rounded-2xl overflow-hidden group h-[450px] transition-all duration-300 hover:shadow-[0_0_25px_rgba(217,70,239,0.25)]">
      {/* Rotating magenta glow border */}
      <div
        className="absolute inset-[-150%] animate-spin opacity-20 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          animationDuration: '3.5s',
          background: 'conic-gradient(from 0deg, transparent 0%, transparent 40%, #d946ef 50%, transparent 60%, transparent 100%)',
        }}
      />
      <Card className="relative z-10 w-full h-full flex flex-col items-center justify-center p-4 bg-zinc-950/85 group-hover:bg-zinc-900/90 backdrop-blur-sm border border-zinc-800/50 rounded-[14px] overflow-hidden transition-all duration-300">
        {/* Background Hollowed Image */}
        <Image 
          src={bgImage} 
          alt="Ace Card Frame" 
          fill 
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-contain z-0 opacity-20 p-2 pointer-events-none transition-opacity duration-300 group-hover:opacity-30"
        />
        
        <div className="relative z-20 flex flex-col items-center text-center justify-center space-y-3 w-full p-4 mt-8">
          
          <div className="relative inline-block -mt-12">
            <Avatar className="h-16 w-16 border-2 border-white/10 shadow-md">
              <AvatarImage src={member.avatarUrl} />
              <AvatarFallback className="bg-zinc-800 text-white">{member.name[0]}</AvatarFallback>
            </Avatar>
            {finalBadge && finalBadge !== 'none' && (
              <div className={cn(
                "absolute -right-8 -top-2 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border backdrop-blur-md z-30",
                getBadgeColor(finalBadge)
              )}>
                {finalBadge}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="font-headline font-bold text-lg tracking-tight text-white">{member.name}</h3>
            <p className="text-[10px] font-mono text-white/80 uppercase tracking-widest font-bold">{member.role}</p>
          </div>

          {typeof member.completedProjects === 'number' && (
            <span className="text-[9px] font-mono text-white/90 uppercase tracking-widest font-semibold bg-white/5 border border-white/10 px-2 py-1 rounded">
              Completed Projects: <span className="text-white font-bold">{member.completedProjects}</span>
            </span>
          )}
          
          <p className="text-[11px] text-white leading-relaxed font-medium break-words px-2 w-full">
            {displayBio}
            {shouldTruncate && (
              <button 
                type="button"
                onClick={(e) => { e.preventDefault(); setIsExpanded(!isExpanded); }}
                className="text-primary font-mono font-bold ml-1.5 focus:outline-none inline-block hover:underline"
              >
                {isExpanded ? ' [Less]' : '...more'}
              </button>
            )}
          </p>

          <div className="flex flex-wrap justify-center gap-1.5 mt-2">
            {displaySkills.slice(0, 4).map((skill) => (
              <Badge 
                key={skill} 
                variant="outline" 
                className="text-[8px] border-white/10 bg-white/5 text-white uppercase tracking-tighter font-bold flex items-center"
              >
                {getSkillIcon(skill)}
                {skill}
              </Badge>
            ))}
            {displaySkills.length > 4 && (
              <Badge variant="outline" className="text-[8px] border-white/10 bg-white/5 text-white uppercase tracking-tighter font-bold">
                +{displaySkills.length - 4}
              </Badge>
            )}
          </div>
        </div>
        
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 select-none bg-zinc-950/90 px-2.5 py-1 rounded-full shadow-sm border border-zinc-800">
          <span className={cn(
            "rounded-full transition-all duration-300",
            member.isOnline !== false 
              ? "h-2 w-2 bg-green-500 animate-pulse" 
              : "h-2 w-2 bg-zinc-600"
          )} />
          <span className="text-[9px] font-mono uppercase tracking-widest text-white font-bold">
            {member.isOnline !== false ? 'Online' : 'Offline'}
          </span>
        </div>
      </Card>
    </div>
  );
}
