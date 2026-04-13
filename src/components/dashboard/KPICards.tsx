import { TrendingUp, FileCheck, FolderOpen, ClipboardList, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../ui/card';
import { JudgementBadge } from '../ui/judgement-badge';
import { Progress } from '../ui/progress';
import { JUDGEMENT_COLORS, ratingToPercent, type JudgementLevel } from '../../lib/judgement';

interface KPICardsProps {
  overallJudgement: JudgementLevel;
  ratedCount: number;
  totalCount: number;
  evidenceCount: number;
  pendingActions: number;
  totalActions: number;
  overdueActions: number;
}

export function KPICards({
  overallJudgement, ratedCount, totalCount,
  evidenceCount, pendingActions, totalActions, overdueActions,
}: KPICardsProps) {
  const compliancePercent = ratingToPercent(overallJudgement);
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Proficiency Rate → /performance-data */}
      <Card
        className="cursor-pointer hover:ring-2 hover:ring-[#01696f]/40 hover:shadow-md transition-all"
        onClick={() => navigate('/performance-data')}
      >
        <CardContent className="p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${JUDGEMENT_COLORS[overallJudgement]}20` }}>
              <TrendingUp className="h-5 w-5" style={{ color: JUDGEMENT_COLORS[overallJudgement] }} />
            </div>
            <JudgementBadge level={overallJudgement} />
          </div>
          <div className="text-2xl font-bold text-[#1a1a1a]">{compliancePercent}%</div>
          <div className="text-xs text-[#6b7280] mt-0.5">Overall Compliance Score</div>
          <ArrowRight className="h-4 w-4 text-gray-400 absolute bottom-3 right-3" />
        </CardContent>
      </Card>

      {/* Indicators Rated → /observations */}
      <Card
        className="cursor-pointer hover:ring-2 hover:ring-blue-400/40 hover:shadow-md transition-all"
        onClick={() => navigate('/observations')}
      >
        <CardContent className="p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileCheck className="h-5 w-5 text-blue-600" />
            </div>
            <span className="text-xs text-[#6b7280]">{totalCount} total</span>
          </div>
          <div className="text-2xl font-bold text-[#1a1a1a]">{ratedCount}</div>
          <div className="text-xs text-[#6b7280] mt-0.5 mb-2">Indicators Rated</div>
          <Progress value={totalCount ? (ratedCount / totalCount) * 100 : 0} className="h-1.5" />
          <ArrowRight className="h-4 w-4 text-gray-400 absolute bottom-3 right-3" />
        </CardContent>
      </Card>

      {/* Evidence Files → /evidence */}
      <Card
        className="cursor-pointer hover:ring-2 hover:ring-purple-400/40 hover:shadow-md transition-all"
        onClick={() => navigate('/evidence')}
      >
        <CardContent className="p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#1a1a1a]">{evidenceCount}</div>
          <div className="text-xs text-[#6b7280] mt-0.5">Evidence Files Uploaded</div>
          <ArrowRight className="h-4 w-4 text-gray-400 absolute bottom-3 right-3" />
        </CardContent>
      </Card>

      {/* Action Items → /improvement-plan */}
      <Card
        className="cursor-pointer hover:ring-2 hover:ring-amber-400/40 hover:shadow-md transition-all"
        onClick={() => navigate('/improvement-plan')}
      >
        <CardContent className="p-5 relative">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
              <ClipboardList className="h-5 w-5 text-amber-600" />
            </div>
            {overdueActions > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {overdueActions} overdue
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-[#1a1a1a]">{pendingActions}</div>
          <div className="text-xs text-[#6b7280] mt-0.5">Pending Actions of {totalActions}</div>
          <ArrowRight className="h-4 w-4 text-gray-400 absolute bottom-3 right-3" />
        </CardContent>
      </Card>
    </div>
  );
}
