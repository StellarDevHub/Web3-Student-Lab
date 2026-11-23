'use client';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { api } from '@/lib/api';
import { formatDistanceToNow } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Briefcase, CheckCircle, Clock, DollarSign, Star, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Milestone {
  description: string;
  amount: number;
  completed: boolean;
  approved: boolean;
  released: boolean;
}

interface Job {
  id: number;
  client: string;
  freelancer: string | null;
  title: string;
  description: string;
  milestones: Milestone[];
  total_budget: number;
  status: 'Open' | 'InProgress' | 'Completed' | 'Disputed' | 'Cancelled';
  applications: string[];
  created_at: number;
}

interface Review {
  job_id: number;
  reviewer: string;
  reviewee: string;
  rating: number;
  comment: string;
  timestamp: number;
}

interface Reputation {
  total_score: number;
  review_count: number;
  average_rating: number;
  completed_jobs: number;
}

export default function FreelanceDashboard() {
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [reputation, setReputation] = useState<Reputation | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showPostJob, setShowPostJob] = useState(false);
  const [showReview, setShowReview] = useState<{ jobId: number; reviewee: string } | null>(null);

  // Post job form
  const [postTitle, setPostTitle] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [milestones, setMilestones] = useState<{ description: string; amount: string }[]>([
    { description: '', amount: '' },
  ]);

  // Review form
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [openJobs, myJobsData, repData, reviewData] = await Promise.all([
        api.get('/freelance/jobs/open'),
        api.get('/freelance/jobs/my'),
        api.get(`/freelance/reputation/${user?.address}`),
        api.get(`/freelance/reviews/${user?.address}`),
      ]);
      setJobs(openJobs.data || []);
      setMyJobs(myJobsData.data || []);
      setReputation(repData.data || null);
      setReviews(reviewData.data || []);
    } catch (e) {
      console.error('Failed to fetch freelance data', e);
    } finally {
      setLoading(false);
    }
  };

  const postJob = async () => {
    const milestoneDescriptions = milestones.map((m) => m.description);
    const milestoneAmounts = milestones.map((m) => parseInt(m.amount) || 0);
    await api.post('/freelance/jobs', {
      title: postTitle,
      description: postDescription,
      milestone_descriptions: milestoneDescriptions,
      milestone_amounts: milestoneAmounts,
    });
    setShowPostJob(false);
    setPostTitle('');
    setPostDescription('');
    setMilestones([{ description: '', amount: '' }]);
    fetchData();
  };

  const applyForJob = async (jobId: number) => {
    await api.post(`/freelance/jobs/${jobId}/apply`);
    fetchData();
  };

  const completeMilestone = async (jobId: number, index: number) => {
    await api.post(`/freelance/jobs/${jobId}/milestone/${index}/complete`);
    fetchData();
  };

  const approveMilestone = async (jobId: number, index: number) => {
    await api.post(`/freelance/jobs/${jobId}/milestone/${index}/approve`);
    fetchData();
  };

  const submitReview = async () => {
    if (!showReview) return;
    await api.post('/freelance/reviews', {
      job_id: showReview.jobId,
      reviewee: showReview.reviewee,
      rating,
      comment: reviewComment,
    });
    setShowReview(null);
    setRating(5);
    setReviewComment('');
    fetchData();
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      Open: 'secondary',
      InProgress: 'default',
      Completed: 'outline',
      Disputed: 'destructive',
      Cancelled: 'outline',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="border-primary h-10 w-10 animate-spin rounded-full border-b-2" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Freelance Marketplace</h1>
          <p className="text-muted-foreground">
            Find work or hire talent with milestone-based escrow
          </p>
        </div>
        <Button onClick={() => setShowPostJob(true)}>
          <Briefcase className="mr-2 h-4 w-4" />
          Post a Job
        </Button>
      </div>

      {/* Reputation Card */}
      {reputation && (
        <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardContent className="flex items-center gap-6 p-5">
            <div className="flex items-center gap-2">
              <Star className="h-8 w-8 fill-yellow-500 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{(reputation.average_rating / 100).toFixed(1)}</p>
                <p className="text-muted-foreground text-xs">{reputation.review_count} reviews</p>
              </div>
            </div>
            <div className="flex-1" />
            <div className="text-right">
              <p className="text-muted-foreground text-sm">Completed Jobs</p>
              <p className="text-xl font-bold">{reputation.completed_jobs}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">
            <Briefcase className="mr-2 h-4 w-4" />
            Browse Jobs
          </TabsTrigger>
          <TabsTrigger value="my-jobs">
            <CheckCircle className="mr-2 h-4 w-4" />
            My Jobs
          </TabsTrigger>
          <TabsTrigger value="reviews">
            <Star className="mr-2 h-4 w-4" />
            Reviews
          </TabsTrigger>
        </TabsList>

        {/* Browse Jobs */}
        <TabsContent value="browse" className="mt-4 space-y-4">
          {jobs.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground p-12 text-center">
                <Briefcase className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>No open jobs available. Be the first to post one!</p>
              </CardContent>
            </Card>
          ) : (
            jobs.map((job) => (
              <Card
                key={job.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => setSelectedJob(job)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{job.title}</h3>
                        {getStatusBadge(job.status)}
                      </div>
                      <p className="text-muted-foreground line-clamp-2 text-sm">
                        {job.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          {job.total_budget.toLocaleString()} stroops
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatDistanceToNow(job.created_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          {job.milestones.length} milestones
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {job.applications.length} applicants
                        </span>
                      </div>
                    </div>
                  </div>
                  {job.status === 'Open' && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        applyForJob(job.id);
                      }}
                    >
                      Apply
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* My Jobs */}
        <TabsContent value="my-jobs" className="mt-4 space-y-4">
          {myJobs.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground p-12 text-center">
                <CheckCircle className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>No active jobs. Apply or post to get started!</p>
              </CardContent>
            </Card>
          ) : (
            myJobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{job.title}</h3>
                      {getStatusBadge(job.status)}
                    </div>
                    <p className="font-bold">{job.total_budget.toLocaleString()} stroops</p>
                  </div>
                  {/* Milestones */}
                  <div className="space-y-2">
                    {job.milestones.map((m, i) => (
                      <div key={i} className="bg-muted/50 flex items-center gap-3 rounded p-2">
                        <Progress
                          value={m.released ? 100 : m.approved ? 75 : m.completed ? 50 : 0}
                          className="h-2 flex-1"
                        />
                        <span className="w-32 truncate text-sm">{m.description}</span>
                        <span className="font-mono text-sm">{m.amount.toLocaleString()}</span>
                        {job.status === 'InProgress' && (
                          <>
                            {!m.completed && job.freelancer === user?.address && (
                              <Button size="sm" onClick={() => completeMilestone(job.id, i)}>
                                Mark Complete
                              </Button>
                            )}
                            {m.completed && !m.approved && job.client === user?.address && (
                              <Button size="sm" onClick={() => approveMilestone(job.id, i)}>
                                Approve & Release
                              </Button>
                            )}
                            {m.released && <Badge variant="outline">Paid</Badge>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  {job.status === 'Completed' && (
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        setShowReview({
                          jobId: job.id,
                          reviewee: job.client === user?.address ? job.freelancer! : job.client,
                        })
                      }
                    >
                      <Star className="mr-1 h-3 w-3" />
                      Leave Review
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Reviews */}
        <TabsContent value="reviews" className="mt-4 space-y-4">
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground p-12 text-center">
                <Star className="mx-auto mb-3 h-12 w-12 opacity-30" />
                <p>No reviews yet. Complete jobs to earn reviews!</p>
              </CardContent>
            </Card>
          ) : (
            reviews.map((review, i) => (
              <Card key={i}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex items-center gap-1 text-yellow-500">
                    {Array.from({ length: review.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-yellow-500" />
                    ))}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">{review.comment}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Job #{review.job_id} · {formatDistanceToNow(review.timestamp)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Post Job Dialog */}
      <Dialog open={showPostJob} onOpenChange={setShowPostJob}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post a New Job</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Job Title</label>
              <Input
                value={postTitle}
                onChange={(e) => setPostTitle(e.target.value)}
                placeholder="e.g. Build a DeFi dashboard"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={postDescription}
                onChange={(e) => setPostDescription(e.target.value)}
                placeholder="Describe the project requirements..."
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">Milestones</label>
              {milestones.map((m, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <Input
                    placeholder={`Milestone ${i + 1} description`}
                    value={m.description}
                    onChange={(e) => {
                      const updated = [...milestones];
                      updated[i].description = e.target.value;
                      setMilestones(updated);
                    }}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={m.amount}
                    onChange={(e) => {
                      const updated = [...milestones];
                      updated[i].amount = e.target.value;
                      setMilestones(updated);
                    }}
                    className="w-32"
                  />
                  {milestones.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                    >
                      ✕
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMilestones([...milestones, { description: '', amount: '' }])}
              >
                + Add Milestone
              </Button>
            </div>
            <Button onClick={postJob} className="w-full">
              Post Job
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={!!showReview} onOpenChange={() => setShowReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave a Review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} onClick={() => setRating(star)}>
                  <Star
                    className={`h-6 w-6 ${star <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}`}
                  />
                </button>
              ))}
            </div>
            <Input
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Write your review..."
            />
            <Button onClick={submitReview} className="w-full">
              Submit Review
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedJob?.title}</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">{selectedJob.description}</p>
              <div className="flex items-center gap-4 text-sm">
                <span>Budget: {selectedJob.total_budget.toLocaleString()} stroops</span>
                <span>Status: {getStatusBadge(selectedJob.status)}</span>
                <span>{selectedJob.applications.length} applicants</span>
              </div>
              <div className="space-y-2">
                <p className="font-medium">Milestones:</p>
                {selectedJob.milestones.map((m, i) => (
                  <div key={i} className="bg-muted flex justify-between rounded p-2 text-sm">
                    <span>{m.description}</span>
                    <span className="font-mono">{m.amount.toLocaleString()} stroops</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
