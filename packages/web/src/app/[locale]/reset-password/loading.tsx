export default function ResetPasswordLoading() {
 return (
 <div className="min-h-screen flex items-center justify-center px-4 animate-fade-in">
  <div className="w-full max-w-sm space-y-6">
  <div className="h-8 bg-surface-2 rounded-lg w-48 mx-auto animate-pulse" />
  <div className="h-4 bg-surface-2 rounded w-64 mx-auto animate-pulse" />
  <div className="space-y-4 mt-6">
   <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
   <div className="h-10 bg-surface-2 rounded-lg animate-pulse" />
   <div className="h-10 bg-primary-600/30 rounded-lg animate-pulse" />
  </div>
  </div>
 </div>
 );
}
