export default function Navbar({ onLogout }) {
    return (
        <nav className="bg-white shadow-sm border-b px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold">Q</div>
                <span className="font-bold text-xl">QC App</span>
            </div>
            <button onClick={onLogout} className="text-gray-600 hover:text-red-600 font-medium">
                Logout
            </button>
        </nav>
    );
}
