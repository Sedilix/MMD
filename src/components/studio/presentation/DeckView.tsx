'use client';

import React from 'react';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { SlideCard } from './SlideCard';
import { FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModelUsedBadge } from '../StudioShared';

interface SlideOutlineItem {
  title: string;
  summary: string;
  bullets: string[];
  imagePrompt: string;
  imageUrl?: string;
}

interface DeckViewProps {
  title: string;
  slides: SlideOutlineItem[];
  setSlides: (slides: SlideOutlineItem[]) => void;
  theme: 'dark' | 'light' | 'gradient' | 'corporate';
  setTheme: (theme: 'dark' | 'light' | 'gradient' | 'corporate') => void;
  onBack: () => void;
  onExportPPTX: () => void;
  onExportPDF: () => void;
  exporting: boolean;
  /** The model that generated the outline, surfaced so the user always knows
   *  which engine wrote the deck (recognition over recall). Optional to keep
   *  the component usable without it. */
  model?: string;
}

export function DeckView({
  title,
  slides,
  setSlides,
  theme,
  setTheme,
  onBack,
  onExportPPTX,
  onExportPDF,
  exporting,
  model
}: DeckViewProps) {

  const handleUpdateSlide = (index: number, updated: SlideOutlineItem) => {
    setSlides(slides.map((s, i) => i === index ? updated : s));
  };

  const handleDeleteSlide = (index: number) => {
    setSlides(slides.filter((_, i) => i !== index));
  };

  const handleAddSlide = () => {
    const newSlide: SlideOutlineItem = {
      title: 'New Slide Title',
      summary: 'Provide a brief summary.',
      bullets: ['First bullet point', 'Second bullet point'],
      imagePrompt: 'A simple graphic showing development progress'
    };
    setSlides([...slides, newSlide]);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      
      {/* Workspace Sub-header controls */}
      <div className="flex items-center justify-between border-b border-border bg-card/10 px-6 py-3 shrink-0">
        
        {/* Navigation + model that produced this deck */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Icon name="arrow-left-md" className="h-4 w-4" /> Back to Outline
          </Button>
          {model && <ModelUsedBadge model={model} />}
        </div>

        {/* Theme Picker & Exporters */}
        <div className="flex items-center gap-3">
          
          {/* Theme Selector */}
          <div className="flex items-center gap-1.5 border border-border rounded-lg bg-card px-2.5 py-1">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Theme:</span>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as any)}
              className="bg-transparent text-xs text-foreground font-semibold focus:outline-none cursor-pointer"
            >
              <option value="dark">Charcoal Dark</option>
              <option value="light">Studio Light</option>
              <option value="gradient">Deep Plum Gradient</option>
              <option value="corporate">Minimal Corporate</option>
            </select>
          </div>

          {/* PPTX Export */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportPPTX}
            disabled={exporting || slides.length === 0}
            className="h-8 gap-1.5 text-xs font-semibold border-border bg-card"
          >
            {exporting ? <span className="animate-pulse">Exporting...</span> : (
              <>
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-500" /> Export PPTX
              </>
            )}
          </Button>

          {/* PDF Export */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportPDF}
            disabled={exporting || slides.length === 0}
            className="h-8 gap-1.5 text-xs font-semibold border-border bg-card"
          >
            {exporting ? <span className="animate-pulse">Exporting...</span> : (
              <>
                <Icon name="file-document" className="h-3.5 w-3.5 text-red-500" /> Export PDF
              </>
            )}
          </Button>

        </div>

      </div>

      {/* Slide list area */}
      <div className="flex-1 overflow-auto bg-muted/10 py-8 px-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          <div className="text-center select-text space-y-1 mb-8">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">Double-click on titles, summaries, or bullets to edit deck text inline.</p>
          </div>

          <div className="space-y-6">
            {slides.map((slide, index) => (
              <SlideCard
                key={index}
                slide={slide}
                index={index}
                theme={theme}
                onUpdate={(updated) => handleUpdateSlide(index, updated)}
                onDelete={() => handleDeleteSlide(index)}
              />
            ))}
          </div>

          {/* Add Slide card trigger */}
          <button
            type="button"
            onClick={handleAddSlide}
            className="w-full h-16 border border-dashed border-border/80 hover:border-primary/50 bg-card/20 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all mt-4"
          >
            <Icon name="plus" className="h-4 w-4" /> Add New Slide Card
          </button>

        </div>
      </div>

    </div>
  );
}
