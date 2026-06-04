export default function AlertCards({ blocked, overdue }: { blocked: number; overdue: number }) {
    return (
        <div className="mt-3 flex gap-3">
            <div className={`flex-1 rounded-md p-3 ${blocked > 0 ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-700'}`}>
                <div className="text-xs uppercase tracking-wide">Blocked tests</div>
                <div className="text-2xl font-semibold">{blocked}</div>
            </div>
            <div className={`flex-1 rounded-md p-3 ${overdue > 0 ? 'bg-red-50 text-red-900' : 'bg-gray-50 text-gray-700'}`}>
                <div className="text-xs uppercase tracking-wide">Overdue tasks</div>
                <div className="text-2xl font-semibold">{overdue}</div>
            </div>
        </div>
    );
}
