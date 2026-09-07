import { lazy, Suspense } from 'react'
import AnimatedHighlightedAreaChart from './blocks/animated-area-chart'
import Section from './layout/Section'
import { SectionHeading } from './motion/SectionHeading'

// Lazy so recharts moves out of the eager /threatfeed route chunk (the donut
// renders below the fold; the route's tables must not wait on it).
const CategoryChart = lazy(() => import('./blocks/category-chart'))

export default function Analytics({ statsData, feedVersion, statsFailed, onRetryStats }: any) {
  return (
    <Section id="analytics" className="overflow-hidden" containerClassName="relative z-10">
        <SectionHeading
          title="Threat landscape"
          subtitle="How the database has grown, day by day, since we started keeping history. Rebuilt on every feed refresh."
          className="mb-14"
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <AnimatedHighlightedAreaChart feedVersion={feedVersion} />
          </div>

          {/* Donut Chart Card */}
          <div className="glass-card p-6 relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-px w-full bg-gradient-to-r from-transparent via-red-500/40 to-transparent"></div>

            <div className="relative z-10 h-full flex flex-col">
              <h3 className="text-xl font-bold mb-8 text-white tracking-tight">Threat classes by volume</h3>
              <div className="flex-1 w-full relative flex items-center justify-center min-h-[300px]">
                {statsData?.category_counts ? (
                  <Suspense fallback={null}>
                    <CategoryChart categories={statsData.category_counts} />
                  </Suspense>
                ) : statsFailed ? (
                  <div className="text-center max-w-[16rem]">
                    <p className="text-sm font-medium text-slate-300">
                      Feed data unavailable. The last refresh could not reach the live feed.
                    </p>
                    {onRetryStats && (
                      <button
                        onClick={onRetryStats}
                        className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 transition-colors hover:bg-white/[0.08] hover:text-white"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="max-w-[16rem] text-center text-sm font-medium text-slate-400">
                    Category breakdown appears once the live feed has loaded.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
    </Section>
  )
}
