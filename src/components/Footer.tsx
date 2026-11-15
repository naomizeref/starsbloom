import React from "react";
import { motion } from "motion/react";
import { useOrbit } from "../context/OrbitContext";

interface FooterProps {
  onNavigate: (view: string) => void;
}

const FOOTER_LINKS: { label: string; view: string; href: string }[] = [
  { label: "About Us", view: "home#about-us", href: "/#about-us" },
  { label: "Markets", view: "markets", href: "/markets" },
  // Guests get bounced to /auth by the route guard; signed-in users land on KYC.
  { label: "Security", view: "dashboard-kyc", href: "/dashboard/kyc" },
  { label: "Contact", view: "home#contact", href: "/#contact" },
  { label: "Terms of Service", view: "terms", href: "/terms" },
  { label: "Privacy Policy", view: "privacy", href: "/privacy" },
  { label: "Risk Disclosure", view: "risk", href: "/risk" }
];

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const { appSettings } = useOrbit();

  return (
    <footer className="py-20 px-4 bg-[#05070B] border-t border-[#2B3139]/30">
      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        whileInView={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 1 }}
        className="h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent mb-16"
      />
      <div className="orb-panel max-w-7xl mx-auto grid gap-10 p-6 sm:p-8 md:grid-cols-[1.2fr_0.8fr_0.8fr] font-mono text-sm">
        <div className="mb-4">
          <div className="flex items-center gap-2.5 mb-2">
            <img
              src="/bloom-logo-white.svg"
              alt="Bloom"
              className="h-8 w-auto object-contain"
            />
          </div>
          <p className="text-neutral-400 mb-4">Trade smarter with confidence.</p>
            <p className="text-neutral-500">
            <span className="lowercase text-white font-medium">bloom</span> is committed to delivering a secure and seamless trading experience through innovation, transparency, and reliability.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {FOOTER_LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(link.view);
              }}
              className="text-neutral-400 hover:text-amber-500 transition-colors text-left cursor-pointer inline-block"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div>
          <h4 className="font-bold text-white mb-4">Contact Us</h4>
          <p className="text-neutral-400 mb-2">Need help? Our support team is here for you.</p>
          <a href={`mailto:${appSettings.supportEmail}`} className="text-amber-500 hover:text-amber-400 hover:underline transition-colors flex items-center gap-2">
            {appSettings.supportEmail}
          </a>
          <p className="text-neutral-500 mt-2">{appSettings.supportPhone}</p>
          <p className="text-neutral-500 mt-3 not-italic leading-relaxed">{appSettings.companyAddress}</p>
        </div>
      </div>
    </footer>
  );
};
