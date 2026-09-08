
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';

const packages = [
  {
    name: 'Discovery & Blueprint',
    price: 'Fixed Price: $800',
    description: 'Before spending thousands on code, we map out your app, build clickable wireframes, and deliver a technical roadmap.',
    features: ['Clickable UI Wireframes', 'Technical Architecture Specs', 'Database Schema Design', 'Feasibility Study & Roadmap', 'Fixed-Price Blueprint'],
    popular: false,
    tagline: 'I want to test the waters and map out my idea safely',
  },
  {
    name: 'The 14-Day MVP',
    price: 'Starts at $3,500',
    description: 'Get a fully functional prototype ready for investor demos and early user testing in just two weeks.',
    features: ['Rapid Prototype Delivery', 'Custom Frontend UI/UX', 'Cloud Database Integration', 'Basic AI Integration', 'Full Source Code Ownership'],
    popular: false,
    tagline: 'I want to start a business and pitch to investors fast',
  },
  {
    name: 'Enterprise Scale-Up',
    price: 'Starts at $8,500',
    description: 'For growing companies that need custom enterprise-grade infrastructure, secure data pipelines, and third-party API integrations.',
    features: ['Scalable System Architecture', 'Automated Data Pipelines', 'Cloud Deployments (AWS/GCP)', 'Enterprise Security Standards', 'Custom API Integrations'],
    popular: true,
    tagline: 'I want to build a robust, scalable digital product',
  },
  {
    name: 'The Full Works A-Z',
    price: 'Starts at $18,000',
    description: 'Bespoke, secure AI solutions including multi-agent workflows and private, on-prem data retrieval for your enterprise.',
    features: ['Automated AI Worker Workflows', '100% Private AI (Zero-Egress)', 'Custom AI Trained on Your Data', 'Deep Systems Integration', 'White-Glove Deployment'],
    popular: false,
    tagline: 'I want elite, secure AI infrastructure customized for me',
  },
  {
    name: 'SG Incorporation & Setup',
    price: 'Custom Scope',
    description: 'Establish a compliant local entity to hire, set up payroll, and manage work passes natively.',
    features: ['Singapore Entity Incorporation', 'Employment Pass & Work Visa Support', 'Corporate Secretary & Compliance', 'Local Directorship Setup Support'],
    popular: false,
    tagline: 'I want to set up shop in Singapore compliantly',
  }
];

export function PricingSection() {
  return (
    <div className="w-full bg-black py-24 relative z-20 overflow-hidden" id="services">
      {/* Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center space-y-4 mb-16">
          <h2 className="text-3xl md:text-5xl font-headline font-bold uppercase tracking-tighter text-white">
            Specialized Capabilities
          </h2>
          <p className="text-zinc-400 font-body max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
            We are your trusted technical partners, delivering scalable digital infrastructure and getting your product to market securely.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 justify-center">
          {packages.map((pkg, idx) => (
            <div 
              key={idx} 
              className={`relative flex flex-col p-5 xl:p-4 rounded-2xl border ${
                pkg.popular 
                  ? 'border-primary/50 bg-zinc-950 shadow-[0_0_25px_rgba(216,166,87,0.15)]' 
                  : 'border-white/10 bg-zinc-950/50'
              } backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-primary text-zinc-950 text-[9px] font-mono font-bold uppercase tracking-widest rounded-full">
                  Most Requested
                </div>
              )}
              
              <div className="mb-3 inline-flex items-center self-start rounded-tl-xl rounded-tr-xl rounded-br-xl rounded-bl-sm bg-white/5 border border-white/10 px-2 py-1 min-h-[44px] xl:min-h-[52px]">
                <span className="text-[10px] text-zinc-300 italic leading-tight">"{pkg.tagline}"</span>
              </div>
              <h3 className="text-lg xl:text-base font-headline font-bold text-white mb-1.5 leading-snug min-h-[48px] flex items-center">{pkg.name}</h3>
              <div className="text-primary font-mono text-xs uppercase tracking-widest font-bold mb-3">
                 {pkg.price}
              </div>
              <p className="text-zinc-400 text-[11px] mb-5 flex-1 leading-relaxed min-h-[64px]">
                {pkg.description}
              </p>
              
              <ul className="space-y-2.5 mb-6">
                {pkg.features.map((feature, fIdx) => (
                  <li key={fIdx} className="flex items-start gap-2 text-[11px] text-zinc-300 leading-tight">
                    <Icon name="circle-check" className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <div className="w-full mt-auto flex flex-col gap-2">
                <Link href="https://calendar.app.google/7zpXGWdWu7Q31o9Z8" target="_blank" className="w-full">
                  <div className={`w-full py-2.5 rounded-md font-headline text-[10px] uppercase tracking-widest text-center font-bold transition-all duration-200 cursor-pointer ${
                    pkg.popular
                      ? 'bg-primary text-zinc-950 hover:bg-primary/90'
                      : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                  }`}>
                    Book a FREE Consultation
                  </div>
                </Link>
                <Link href="/proposal-form" className="w-full">
                  <div className={`w-full py-2.5 rounded-md font-headline text-[10px] uppercase tracking-widest text-center font-bold transition-all duration-200 cursor-pointer ${
                    pkg.popular
                      ? 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                      : 'border border-primary/30 text-primary hover:bg-primary/5'
                  }`}>
                    Submit A Proposal
                  </div>
                </Link>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-12 text-center p-6 border border-dashed border-white/10 rounded-2xl bg-white/5 flex flex-col items-center">
           <h4 className="font-headline font-bold text-white uppercase tracking-widest mb-2">Corporate Services & FinOps Integration</h4>
           <p className="text-sm text-zinc-400 max-w-2xl mx-auto mb-6">
             Need specialized accounting, Singapore incorporation, corporate structuring, or infrastructure? We provide custom scoping and white-gloved execution to integrate corporate systems directly into your operations.
           </p>
           <Link href="https://calendar.app.google/7zpXGWdWu7Q31o9Z8" target="_blank">
             <div className="px-8 py-3 rounded-md font-headline text-xs uppercase tracking-widest text-center font-bold transition-all duration-200 cursor-pointer bg-white/5 text-white hover:bg-white/10 border border-white/10">
               Book a FREE Consultation
             </div>
           </Link>
        </div>
      </div>
    </div>
  );
}
