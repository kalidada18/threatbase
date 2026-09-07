import React from "react";
import { Link } from "react-router-dom";

/** Router <Link> for internal hrefs, plain <a> for external — avoids full
 *  document reloads on footer navigation. */
const SmartLink = ({
  href,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
  href.startsWith("/") ? <Link to={href} {...props} /> : <a href={href} {...props} />;

interface Footer7Props {
  logo: {
    url: string;
    src: string;
    alt: string;
    title: string;
  };
  sections: Array<{
    title: string;
    links: Array<{ name: string; href: string }>;
  }>;
  description: string;
  socialLinks: Array<{
    icon: React.ReactElement;
    href: string;
    label: string;
  }>;
  copyright: string;
  legalLinks: Array<{
    name: string;
    href: string;
  }>;
}

export const Footer7 = ({
  logo,
  sections,
  description,
  socialLinks,
  copyright,
  legalLinks,
}: Footer7Props) => {
  return (
    <section className="py-16 md:py-20">
      {/* Width + gutters mirror layout/Container so the footer shares the page's
          optical edges instead of `container`'s narrower breakpoint steps. */}
      <div className="mx-auto w-full max-w-7xl px-6 lg:px-12">
        <div className="flex w-full flex-col justify-between gap-10 lg:flex-row lg:items-start lg:text-left">
          <div className="flex w-full flex-col justify-between gap-6 lg:items-start">
            {/* Logo */}
            <div className="flex items-center gap-2 lg:justify-start">
              <SmartLink href={logo.url}>
                <img
                  src={logo.src}
                  alt={logo.alt}
                  title={logo.title}
                  className="h-8"
                />
              </SmartLink>
              <h2 className="font-display text-xl font-bold tracking-tight text-metal">{logo.title}</h2>
            </div>
            <p className="max-w-full md:max-w-[70%] text-sm text-slate-400 leading-relaxed">
              {description}
            </p>
            <ul className="flex items-center space-x-6 text-slate-400">
              {socialLinks.map((social, idx) => (
                <li key={idx} className="font-medium hover:text-white transition-colors">
                  <a href={social.href} aria-label={social.label}>
                    {social.icon}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid w-full gap-6 grid-cols-2 lg:gap-20">
            {sections.map((section, sectionIdx) => (
              <div key={sectionIdx}>
                <h3 className="mb-4 font-bold text-white">{section.title}</h3>
                <ul className="space-y-3 text-sm text-slate-400">
                  {section.links.map((link, linkIdx) => (
                    <li
                      key={linkIdx}
                      className="font-medium hover:text-white transition-colors"
                    >
                      {/* Underline slides in from the left on hover */}
                      <SmartLink href={link.href} className="group/flink relative inline-block">
                        {link.name}
                        <span
                          aria-hidden
                          className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-red-500/70 transition-transform duration-300 ease-out group-hover/flink:scale-x-100 motion-reduce:transition-none"
                        />
                      </SmartLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-4 border-t border-white/10 py-8 text-xs font-medium text-slate-400 md:flex-row md:items-center md:text-left">
          <p className="order-2 lg:order-1">{copyright}</p>
          <ul className="order-1 flex flex-col gap-2 md:order-2 md:flex-row md:gap-5">
            {legalLinks.map((link, idx) => (
              <li key={idx} className="hover:text-white transition-colors">
                <SmartLink href={link.href}>{link.name}</SmartLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};
