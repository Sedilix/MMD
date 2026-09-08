'use client';

import React from 'react';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface SlideOutlineItem {
  title: string;
  summary: string;
  bullets: string[];
  imagePrompt: string;
}

interface OutlineEditorProps {
  title: string;
  setTitle: (title: string) => void;
  slides: SlideOutlineItem[];
  setSlides: (slides: SlideOutlineItem[]) => void;
  onGenerate: () => void;
  onBack: () => void;
}

export function OutlineEditor({
  title,
  setTitle,
  slides,
  setSlides,
  onGenerate,
  onBack
}: OutlineEditorProps) {

  const handleAddSlide = () => {
    const newSlide: SlideOutlineItem = {
      title: 'New Slide Title',
      summary: 'Brief description of the slide.',
      bullets: ['Point 1', 'Point 2'],
      imagePrompt: 'A simple graphic showing development progress'
    };
    setSlides([...slides, newSlide]);
  };

  const handleDeleteSlide = (index: number) => {
    setSlides(slides.filter((_, i) => i !== index));
  };

  const handleUpdateSlideTitle = (index: number, nextTitle: string) => {
    setSlides(slides.map((s, i) => i === index ? { ...s, title: nextTitle } : s));
  };

  const handleMoveSlide = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= slides.length) return;

    const copy = [...slides];
    const temp = copy[index];
    copy[index] = copy[nextIndex];
    copy[nextIndex] = temp;
    setSlides(copy);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">
      
      {/* Navigation */}
      <div className="flex items-center justify-between select-none">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Icon name="arrow-left-md" className="h-4 w-4" /> Back to Topic Setup
        </Button>
        <span className="text-[10px] font-semibold text-primary uppercase tracking-widest bg-primary/10 px-2.5 py-1 rounded-full">
          Step 2 of 3: Outline Review
        </span>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Review Slide Outline</h2>
        <p className="text-xs text-muted-foreground">
          Review the generated slide structure. You can customize titles, reorder sections, add or delete slides before rendering the full design cards.
        </p>
      </div>

      {/* Main Title Input */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none">Presentation Title</label>
        <Input 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          className="h-10" 
        />
      </div>

      {/* Slide Items List */}
      <div className="space-y-2">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none">Slide Structure ({slides.length} slides)</label>
        
        <div className="space-y-3">
          {slides.map((slide, index) => (
            <div 
              key={index} 
              className="group flex items-center gap-3 border border-border bg-card/40 rounded-xl p-3.5 hover:bg-card/70 transition-all"
            >
              {/* Order index badge */}
              <div className="flex flex-col items-center select-none justify-center h-8 w-8 rounded-lg bg-muted text-muted-foreground text-xs font-mono font-bold shrink-0">
                {index + 1}
              </div>

              {/* Title input */}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={slide.title}
                  onChange={(e) => handleUpdateSlideTitle(index, e.target.value)}
                  className="w-full bg-transparent text-sm font-medium border-b border-transparent focus:border-primary/50 py-0.5 text-foreground focus:outline-none"
                />
                <p className="text-[11px] text-muted-foreground truncate select-none mt-0.5">{slide.summary}</p>
              </div>

              {/* Move / Action Buttons */}
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleMoveSlide(index, 'up')}
                  disabled={index === 0}
                  className="h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                  title="Move slide up"
                >
                  <Icon name="arrow-up-md" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveSlide(index, 'down')}
                  disabled={index === slides.length - 1}
                  className="h-7 w-7 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none"
                  title="Move slide down"
                >
                  <Icon name="arrow-down-md" className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSlide(index)}
                  className="h-7 w-7 rounded-md border border-destructive/20 bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                  title="Delete slide"
                >
                  <Icon name="trash-empty" className="h-3.5 w-3.5" />
                </button>
              </div>

            </div>
          ))}
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-4 border-t border-border select-none">
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={handleAddSlide} 
          className="gap-1.5 text-xs border-border"
        >
          <Icon name="plus" className="h-4 w-4" /> Add Slide Card
        </Button>
        
        <Button 
          type="button" 
          size="sm" 
          onClick={onGenerate}
          className="gap-1.5 text-xs font-semibold uppercase tracking-wider px-6"
        >
          Render Deck Cards <Icon name="play" className="h-3.5 w-3.5 fill-current" />
        </Button>
      </div>

    </div>
  );
}
