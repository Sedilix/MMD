// Legal dialog content components extracted from initialize-specialist/page.tsx
// Keeps the main page file lean and these documents easy to update independently.

export function RatesDialogContent() {
  return (
    <div className="space-y-6 text-sm text-foreground/80 font-body leading-relaxed mt-4">
      <div className="space-y-2">
        <h3 className="font-bold text-white uppercase tracking-wider">1. Base Hourly Rates (SGD / Hour)</h3>
        <p>Base rates are determined by a combination of the Agent&apos;s verified experience level and their historical KPI performance on the platform.</p>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/5 border-b border-white/20">
                <th className="py-2 px-3">Tier</th>
                <th className="py-2 px-3">Base Rate</th>
                <th className="py-2 px-3">Experience / KPI Requirements</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/10">
                <td className="py-2 px-3 font-bold">Tier 1 (Initiate)</td>
                <td className="py-2 px-3 font-bold">SGD 40/hr</td>
                <td className="py-2 px-3">Standard experience. Meets baseline KPIs for communication, code quality, and delivery timelines.</td>
              </tr>
              <tr className="border-b border-white/10 bg-black/[0.02]">
                <td className="py-2 px-3 font-bold">Tier 2 (Advanced)</td>
                <td className="py-2 px-3 font-bold">SGD 50/hr</td>
                <td className="py-2 px-3">Proven track record. Consistently exceeds KPIs. Requires minimal oversight and handles complex tasks efficiently.</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold">Tier 3 (Elite)</td>
                <td className="py-2 px-3 font-bold">SGD 60/hr</td>
                <td className="py-2 px-3">Top-tier performer. Flawless KPI record. Capable of project leadership, architectural decisions, and mentoring.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-primary/10 border border-primary/20 rounded-md text-xs mt-2">
          <strong>Note:</strong> All new Agents start at a provisional Tier 1 rate until their first 2 projects are successfully completed and evaluated by ONE (the AI Architect).
        </div>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="font-bold text-white uppercase tracking-wider">2. Work Hours Component (WHC) Bonus</h3>
        <p>To incentivize deep engagement and consistency, Cybrdeck offers a Work Hours Component (WHC) bonus. This operates as a performance-based retainer for Specialists who dedicate significant weekly bandwidth to Cybrdeck projects.</p>
        <p><strong>Qualification:</strong> Agents must log a minimum of <strong>24 AI-verified billable hours per week</strong> across active projects.<br/>
        <strong>Bonus Applied:</strong> A percentage multiplier (0.2x to 0.8x) added to the base rate for those verified hours, scaling with project complexity and total volume.</p>
        <div className="overflow-x-auto rounded border border-white/10 mt-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-black/5 border-b border-white/20">
                <th className="py-2 px-3">Volume &amp; Output</th>
                <th className="py-2 px-3">WHC Bonus</th>
                <th className="py-2 px-3">Effective Example (Tier 2 @ SGD 50)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/10">
                <td className="py-2 px-3 font-bold">24+ Hours (Standard Output)</td>
                <td className="py-2 px-3 font-bold">+ 20% (0.2x)</td>
                <td className="py-2 px-3">SGD 60.00 / hr</td>
              </tr>
              <tr className="border-b border-white/10 bg-black/[0.02]">
                <td className="py-2 px-3 font-bold">32+ Hours (High Output)</td>
                <td className="py-2 px-3 font-bold">+ 50% (0.5x)</td>
                <td className="py-2 px-3">SGD 75.00 / hr</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-bold">40+ Hours (Elite Output/Multi-Project)</td>
                <td className="py-2 px-3 font-bold">+ 80% (0.8x)</td>
                <td className="py-2 px-3">SGD 90.00 / hr</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-xs mt-2 text-red-900">
          <strong>MoM Compliance &amp; Working Hour Caps:</strong> To comply with Singapore Ministry of Manpower (MoM) guidelines and prevent &quot;disguised employment&quot; legal traps, Agents remain independent contractors. To promote healthy work-life balance in alignment with MoM&apos;s Employment Act (EA) standards, the WHC bonus is strictly capped at a maximum of <strong>44 hours per week</strong>. Hours billed beyond 44/week revert to the standard base rate without the WHC bonus.
        </div>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="font-bold text-white uppercase tracking-wider">3. Financial Safeguards &amp; Smart Time Tracking</h3>
        <p>To prevent time-padding and overpayment, Cybrdeck enforces strict tracking mechanisms. <strong>All billable work must be executed and tracked directly within the Cybrdeck Platform ecosystem.</strong></p>
        <ul className="list-disc pl-5 space-y-1 text-xs mt-2">
          <li><strong>In-Platform Execution:</strong> Hours claimed for off-platform work (untracked local development without Cybrdeck&apos;s time-tracking active) will not be billed or paid.</li>
          <li><strong>AI Verification (ONE):</strong> The ONE Autonomous Lead Architect continuously monitors active sessions. ONE analyzes commit density, idle time, and task progression to validate logged hours. Sessions flagged as &quot;idle&quot; or lacking proportional output will be automatically contested and deducted from billable time.</li>
          <li><strong>Milestone Caps:</strong> Every project is assigned a Maximum Billable Hour limit based on the initial scoping by ONE. Agents cannot bill beyond this cap without explicit Client and Platform re-approval.</li>
          <li><strong>Client Sign-Off:</strong> Funds are held in escrow and are only released upon the Client&apos;s sign-off of the completed sprint/milestone.</li>
        </ul>
      </div>

      <div className="space-y-2 border-t border-white/10 pt-4">
        <h3 className="font-bold text-white uppercase tracking-wider">4. Key Performance Indicators (KPIs) &amp; Penalties</h3>
        <p>Agent tier progression and WHC eligibility are strictly governed by KPIs. Cybrdeck actively down-tiers agents to protect the platform&apos;s reputation and finances.</p>
        <ul className="list-disc pl-5 space-y-1 text-xs mt-2">
          <li><strong>Delivery Velocity:</strong> Missing estimated sprint timelines by more than 15% without justified cause results in immediate forfeiture of the WHC Bonus for that billing cycle.</li>
          <li><strong>Quality &amp; Accuracy:</strong> High bug-rejection rates or failed architectural alignments (as evaluated by ONE) will trigger an immediate review and a potential downgrade from Tier 3/2 to Tier 1.</li>
          <li><strong>Responsiveness:</strong> Failure to maintain SLA communication windows will result in account suspension and withheld payments.</li>
        </ul>
      </div>

      <p className="text-xs italic pt-4 text-center border-t border-white/10">By accepting these rates, the Specialist agrees to the strict adherence of in-platform tracking, independent contractor status under Singapore Law, and the final authority of ONE regarding billable hour validation.</p>
    </div>
  );
}

export function TermsDialogContent() {
  return (
    <div className="space-y-4 text-sm text-foreground/80 font-body">
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
  );
}

export function NdaDialogContent() {
  return (
    <div className="space-y-4 text-sm text-foreground/80 font-body">
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
  );
}
