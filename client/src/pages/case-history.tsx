import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertCircle, ChevronDown, ChevronRight, Clock, FileText, Search, Filter } from "lucide-react";
import { useState, useEffect } from "react";
import { format } from "date-fns";

interface CaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  occurredAt: Date;
  details: string | null;
  createdAt: Date;
}

interface Case {
  caseId: number;
  clientId: number;
  caseCreationDate: Date | null;
  lastCaseStatus: string;
  lastStatusDate: Date | null;
  createdAt: Date | null;
}

interface CaseWithEvents {
  case: Case;
  events: CaseEvent[];
}

interface CaseHistoryResponse {
  success: boolean;
  caseHistory: CaseWithEvents[];
  clientId: string;
}

export default function CaseHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openCases, setOpenCases] = useState<Set<number>>(new Set());

  // Helper function to check if error is 401 Unauthorized
  const isUnauthorizedError = (error: any): boolean => {
    if (!error) return false;
    // Check if error message starts with "401:"
    return typeof error.message === 'string' && error.message.startsWith('401:');
  };

  // Fetch case history data
  const { data, isLoading, error } = useQuery<CaseHistoryResponse>({
    queryKey: ['/api/client/case-history'],
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error: any) => {
      // Don't retry if it's an authentication error
      return !isUnauthorizedError(error) && failureCount < 3;
    },
  });

  // Auto-redirect to login if authentication error
  useEffect(() => {
    if (error && isUnauthorizedError(error)) {
      // Use full navigation to reach the server-rendered login page
      window.location.assign('/client-login');
    }
  }, [error]);

  // Show loading spinner during redirect to avoid flash
  if (error && isUnauthorizedError(error)) {
    return null;
  }

  const toggleCase = (caseId: number) => {
    const newOpenCases = new Set(openCases);
    if (newOpenCases.has(caseId)) {
      newOpenCases.delete(caseId);
    } else {
      newOpenCases.add(caseId);
    }
    setOpenCases(newOpenCases);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'pending': return 'secondary';
      case 'completed': return 'default';
      case 'lawyer-study': return 'secondary';
      default: return 'outline';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'فعال';
      case 'pending': return 'در انتظار';
      case 'completed': return 'تکمیل شده';
      case 'lawyer-study': return 'در حال مطالعه وکیل';
      default: return status;
    }
  };

  const formatPersianDate = (date: Date | string | null) => {
    if (!date) return 'تاریخ نامشخص';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj);
  };

  // Filter cases based on search and status
  const filteredCases = data?.caseHistory?.filter(({ case: caseItem, events }) => {
    const matchesSearch = searchTerm === '' || 
      caseItem.caseId.toString().includes(searchTerm) ||
      events.some(event => 
        event.eventType.includes(searchTerm) ||
        event.details?.includes(searchTerm)
      );
    
    const matchesStatus = statusFilter === 'all' || caseItem.lastCaseStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900" dir="rtl">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4 animate-spin" />
              <p>در حال بارگذاری تاریخچه پرونده‌ها...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !isUnauthorizedError(error)) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900" dir="rtl">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <p>خطا در بارگذاری اطلاعات. لطفاً مجدداً تلاش کنید.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            تاریخچه پرونده‌های حقوقی
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            مشاهده کلیه پرونده‌ها و رویدادهای مرتبط با آن‌ها
          </p>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="جستجو در شماره پرونده، رویدادها..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                  data-testid="input-search"
                />
              </div>
              
              {/* Status Filter */}
              <div className="relative">
                <Filter className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-10"
                  data-testid="select-status-filter"
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="active">فعال</option>
                  <option value="pending">در انتظار</option>
                  <option value="completed">تکمیل شده</option>
                  <option value="lawyer-study">در حال مطالعه وکیل</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cases List */}
        {filteredCases.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                هیچ پرونده‌ای یافت نشد
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {searchTerm || statusFilter !== 'all' 
                  ? 'تنظیمات جستجو یا فیلتر را تغییر دهید'
                  : 'هنوز پرونده‌ای برای شما ثبت نشده است'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredCases.map(({ case: caseItem, events }) => {
              const isOpen = openCases.has(caseItem.caseId);
              
              return (
                <Card key={caseItem.caseId} className="overflow-hidden" data-testid={`card-case-${caseItem.caseId}`}>
                  <Collapsible open={isOpen} onOpenChange={() => toggleCase(caseItem.caseId)}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {isOpen ? (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-400" />
                            )}
                            <div>
                              <CardTitle className="text-xl" data-testid={`text-case-number-${caseItem.caseId}`}>
                                پرونده شماره {caseItem.caseId}
                              </CardTitle>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <span>تاریخ ایجاد: {formatPersianDate(caseItem.caseCreationDate)}</span>
                                {caseItem.lastStatusDate && (
                                  <span>آخرین به‌روزرسانی: {formatPersianDate(caseItem.lastStatusDate)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={getStatusBadgeVariant(caseItem.lastCaseStatus)}
                              data-testid={`status-${caseItem.caseId}`}
                            >
                              {getStatusText(caseItem.lastCaseStatus)}
                            </Badge>
                            <Badge variant="outline" data-testid={`text-events-count-${caseItem.caseId}`}>
                              {events.length} رویداد
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0">
                        <div className="border-t pt-4">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                            تاریخچه رویدادهای پرونده
                          </h4>
                          
                          {events.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p>هنوز رویدادی برای این پرونده ثبت نشده است</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {events.map((event, index) => (
                                <div 
                                  key={event.id} 
                                  className="relative"
                                  data-testid={`event-${event.id}`}
                                >
                                  {/* Timeline line */}
                                  {index < events.length - 1 && (
                                    <div className="absolute right-4 top-10 w-0.5 h-16 bg-gray-200 dark:bg-gray-700"></div>
                                  )}
                                  
                                  <div className="flex gap-4">
                                    <div className="flex-shrink-0">
                                      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                                        <div className="w-3 h-3 rounded-full bg-white"></div>
                                      </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between mb-1">
                                        <h5 className="font-medium text-gray-900 dark:text-gray-100" data-testid={`text-event-type-${event.id}`}>
                                          {event.eventType}
                                        </h5>
                                        <span className="text-xs text-gray-500 dark:text-gray-400" data-testid={`text-event-date-${event.id}`}>
                                          {formatPersianDate(event.occurredAt)}
                                        </span>
                                      </div>
                                      
                                      {event.details && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" data-testid={`text-event-details-${event.id}`}>
                                          {event.details}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}

        {/* Summary Footer */}
        {filteredCases.length > 0 && (
          <Card className="mt-8">
            <CardContent className="pt-6 text-center">
              <div className="flex items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span>{filteredCases.length} پرونده</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {filteredCases.reduce((total, { events }) => total + events.length, 0)} رویداد
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}