// Centered title + subtitle used at the top of the Send, Receive and
// History screens.
export default function PageHeading({ title, subtitle }) {
  return (
    <div className="flex flex-col gap-stack-xs text-center">
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
        {title}
      </h1>
      {subtitle && <p className="font-body-md text-body-md text-muted">{subtitle}</p>}
    </div>
  );
}
