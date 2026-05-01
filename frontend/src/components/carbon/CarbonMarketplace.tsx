'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  TreePine, 
  TrendingUp, 
  Award, 
  Search, 
  Filter, 
  Plus, 
  ShoppingCart, 
  CheckCircle,
  AlertCircle,
  Info,
  Globe,
  Calendar,
  Scale,
  User,
  Clock,
  DollarSign,
  FileText,
  Download
} from 'lucide-react';

// Types for carbon credit system
interface CarbonCredit {
  token_id: string;
  project_id: string;
  vintage: number;
  standard: string;
  amount: number;
  owner: string;
  verification_status: 'Pending' | 'Verified' | 'Rejected' | 'Expired';
  retired: boolean;
  retirement_timestamp?: number;
  retirement_reason?: string;
  metadata_uri: string;
}

interface CarbonProject {
  project_id: string;
  name: string;
  developer: string;
  project_type: string;
  location: string;
  total_capacity: number;
  credits_issued: number;
  status: 'Registered' | 'InVerification' | 'Verified' | 'Active' | 'Completed' | 'Suspended';
  methodology: string;
  metadata_uri: string;
}

interface MarketplaceOrder {
  order_id: string;
  token_id: string;
  seller: string;
  order_type: 'Sell' | 'Buy';
  price: string;
  amount: number;
  filled: number;
  created_at: number;
  expires_at: number;
  active: boolean;
}

interface RetirementCertificate {
  certificate_id: string;
  token_ids: string[];
  beneficiary: string;
  reason: string;
  total_tonnes: number;
  timestamp: number;
  certificate_uri: string;
}

// Mock data for demonstration
const mockCredits: CarbonCredit[] = [
  {
    token_id: '1',
    project_id: 'PROJ_1',
    vintage: 2023,
    standard: 'Verra',
    amount: 1,
    owner: '0x123...',
    verification_status: 'Verified',
    retired: false,
    metadata_uri: 'https://api.carbon-credits.io/credits/1'
  },
  {
    token_id: '2',
    project_id: 'PROJ_2',
    vintage: 2022,
    standard: 'Gold Standard',
    amount: 1,
    owner: '0x456...',
    verification_status: 'Verified',
    retired: false,
    metadata_uri: 'https://api.carbon-credits.io/credits/2'
  }
];

const mockProjects: CarbonProject[] = [
  {
    project_id: 'PROJ_1',
    name: 'Amazon Rainforest Reforestation',
    developer: 'Green Earth Initiative',
    project_type: 'Forestry',
    location: 'BR',
    total_capacity: 10000,
    credits_issued: 1500,
    status: 'Active',
    methodology: 'AMS001.II',
    metadata_uri: 'https://api.carbon-credits.io/projects/1'
  },
  {
    project_id: 'PROJ_2',
    name: 'Solar Power Generation',
    developer: 'Clean Energy Corp',
    project_type: 'Renewable Energy',
    location: 'US',
    total_capacity: 5000,
    credits_issued: 800,
    status: 'Active',
    methodology: 'ACM0002',
    metadata_uri: 'https://api.carbon-credits.io/projects/2'
  }
];

const mockOrders: MarketplaceOrder[] = [
  {
    order_id: '1',
    token_id: '1',
    seller: '0x123...',
    order_type: 'Sell',
    price: '15.50',
    amount: 1,
    filled: 0,
    created_at: Date.now() - 86400000,
    expires_at: Date.now() + 604800000,
    active: true
  }
];

const mockCertificates: RetirementCertificate[] = [
  {
    certificate_id: '1',
    token_ids: ['3', '4'],
    beneficiary: '0x789...',
    reason: 'Corporate sustainability commitment',
    total_tonnes: 2,
    timestamp: Date.now() - 172800000,
    certificate_uri: 'https://api.carbon-credits.io/certificates/1'
  }
];

export default function CarbonMarketplace() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const [credits, setCredits] = useState<CarbonCredit[]>(mockCredits);
  const [projects, setProjects] = useState<CarbonProject[]>(mockProjects);
  const [orders, setOrders] = useState<MarketplaceOrder[]>(mockOrders);
  const [certificates, setCertificates] = useState<RetirementCertificate[]>(mockCertificates);
  const [userCredits, setUserCredits] = useState<CarbonCredit[]>([]);
  const [userOrders, setUserOrders] = useState<MarketplaceOrder[]>([]);
  const [userCertificates, setUserCertificates] = useState<RetirementCertificate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStandard, setFilterStandard] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showRetireCredits, setShowRetireCredits] = useState(false);
  const [selectedCredit, setSelectedCredit] = useState<CarbonCredit | null>(null);
  const [orderPrice, setOrderPrice] = useState('');
  const [orderDuration, setOrderDuration] = useState('7');
  const [retirementReason, setRetirementReason] = useState('');
  const [selectedCreditsToRetire, setSelectedCreditsToRetire] = useState<string[]>([]);

  // Simulate loading user data
  useEffect(() => {
    setUserCredits(credits.slice(0, 1)); // User owns first credit
    setUserOrders(orders);
    setUserCertificates(certificates);
  }, []);

  const filteredCredits = credits.filter(credit => {
    const matchesSearch = credit.project_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         credit.standard.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStandard = filterStandard === 'all' || credit.standard === filterStandard;
    const matchesStatus = filterStatus === 'all' || credit.verification_status === filterStatus;
    return matchesSearch && matchesStandard && matchesStatus && !credit.retired;
  });

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.project_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateOrder = () => {
    if (!selectedCredit || !orderPrice || !orderDuration) return;
    
    const newOrder: MarketplaceOrder = {
      order_id: String(orders.length + 1),
      token_id: selectedCredit.token_id,
      seller: '0x123...', // Current user
      order_type: 'Sell',
      price: orderPrice,
      amount: 1,
      filled: 0,
      created_at: Date.now(),
      expires_at: Date.now() + (parseInt(orderDuration) * 24 * 60 * 60 * 1000),
      active: true
    };
    
    setOrders([...orders, newOrder]);
    setUserOrders([...userOrders, newOrder]);
    setShowCreateOrder(false);
    setOrderPrice('');
    setOrderDuration('7');
    setSelectedCredit(null);
  };

  const handleExecuteTrade = (orderId: string) => {
    const order = orders.find(o => o.order_id === orderId);
    if (!order) return;
    
    // Update order status
    const updatedOrders = orders.map(o => 
      o.order_id === orderId ? { ...o, filled: o.amount, active: false } : o
    );
    setOrders(updatedOrders);
    
    // Update credit ownership
    const updatedCredits = credits.map(c => 
      c.token_id === order.token_id ? { ...c, owner: '0x789...' } : c
    );
    setCredits(updatedCredits);
    
    // Remove from user's credits
    setUserCredits(userCredits.filter(c => c.token_id !== order.token_id));
  };

  const handleRetireCredits = () => {
    if (selectedCreditsToRetire.length === 0 || !retirementReason) return;
    
    const newCertificate: RetirementCertificate = {
      certificate_id: String(certificates.length + 1),
      token_ids: selectedCreditsToRetire,
      beneficiary: '0x123...', // Current user
      reason: retirementReason,
      total_tonnes: selectedCreditsToRetire.length,
      timestamp: Date.now(),
      certificate_uri: `https://api.carbon-credits.io/certificates/${certificates.length + 1}`
    };
    
    setCertificates([...certificates, newCertificate]);
    setUserCertificates([...userCertificates, newCertificate]);
    
    // Update credits status
    const updatedCredits = credits.map(c => 
      selectedCreditsToRetire.includes(c.token_id) 
        ? { ...c, retired: true, retirement_timestamp: Date.now(), retirement_reason }
        : c
    );
    setCredits(updatedCredits);
    setUserCredits(userCredits.filter(c => !selectedCreditsToRetire.includes(c.token_id)));
    
    setShowRetireCredits(false);
    setRetirementReason('');
    setSelectedCreditsToRetire([]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Verified': return 'bg-green-100 text-green-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      case 'Active': return 'bg-green-100 text-green-800';
      case 'InVerification': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <TreePine className="h-8 w-8 text-green-600" />
            Carbon Credit Marketplace
          </h1>
          <p className="text-gray-600 mt-2">
            Trade, verify, and retire high-quality carbon credits
          </p>
        </div>
        <div className="flex gap-4">
          <Button onClick={() => setShowCreateOrder(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Order
          </Button>
          <Button onClick={() => setShowRetireCredits(true)} variant="outline" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Retire Credits
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="portfolio">My Portfolio</TabsTrigger>
          <TabsTrigger value="retirement">Retirement</TabsTrigger>
          <TabsTrigger value="impact">Impact</TabsTrigger>
        </TabsList>

        <TabsContent value="marketplace" className="space-y-6">
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search credits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStandard} onValueChange={setFilterStandard}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Standard" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Standards</SelectItem>
                <SelectItem value="Verra">Verra</SelectItem>
                <SelectItem value="Gold Standard">Gold Standard</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Verified">Verified</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCredits.map((credit) => (
              <Card key={credit.token_id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">Credit #{credit.token_id}</CardTitle>
                      <CardDescription>{credit.project_id}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(credit.verification_status)}>
                      {credit.verification_status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span>{credit.vintage}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-gray-500" />
                      <span>{credit.standard}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Scale className="h-4 w-4 text-gray-500" />
                      <span>{credit.amount} tonne</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-500" />
                      <span>{credit.owner}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      className="flex-1"
                      onClick={() => handleExecuteTrade(orders.find(o => o.token_id === credit.token_id)?.order_id || '')}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Buy Credit
                    </Button>
                    <Button size="sm" variant="outline">
                      <Info className="h-4 w-4 mr-2" />
                      Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="projects" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredProjects.map((project) => (
              <Card key={project.project_id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{project.name}</CardTitle>
                      <CardDescription>{project.project_type} in {project.location}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(project.status)}>
                      {project.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Developer:</span>
                      <span>{project.developer}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Methodology:</span>
                      <span>{project.methodology}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Credits Issued:</span>
                      <span>{project.credits_issued} / {project.total_capacity}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span>{Math.round((project.credits_issued / project.total_capacity) * 100)}%</span>
                    </div>
                    <Progress value={(project.credits_issued / project.total_capacity) * 100} />
                  </div>
                  
                  <Button variant="outline" className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    View Project Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>My Carbon Credits</CardTitle>
                <CardDescription>Credits you currently own</CardDescription>
              </CardHeader>
              <CardContent>
                {userCredits.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No credits owned</p>
                ) : (
                  <div className="space-y-4">
                    {userCredits.map((credit) => (
                      <div key={credit.token_id} className="flex justify-between items-center p-3 border rounded">
                        <div>
                          <p className="font-medium">Credit #{credit.token_id}</p>
                          <p className="text-sm text-gray-500">{credit.project_id} - {credit.standard}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedCredit(credit);
                              setShowCreateOrder(true);
                            }}
                          >
                            Sell
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedCreditsToRetire([credit.token_id])}
                          >
                            Retire
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My Orders</CardTitle>
                <CardDescription>Active trading orders</CardDescription>
              </CardHeader>
              <CardContent>
                {userOrders.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No active orders</p>
                ) : (
                  <div className="space-y-4">
                    {userOrders.map((order) => (
                      <div key={order.order_id} className="flex justify-between items-center p-3 border rounded">
                        <div>
                          <p className="font-medium">Order #{order.order_id}</p>
                          <p className="text-sm text-gray-500">
                            {order.order_type} - {order.price} USDC
                          </p>
                        </div>
                        <Badge className={order.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                          {order.active ? 'Active' : 'Filled'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="retirement" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Retirement Certificates</CardTitle>
              <CardDescription>Records of permanently retired carbon credits</CardDescription>
            </CardHeader>
            <CardContent>
              {userCertificates.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No retirement certificates</p>
              ) : (
                <div className="space-y-6">
                  {userCertificates.map((certificate) => (
                    <Card key={certificate.certificate_id} className="border-l-4 border-green-500">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg">Certificate #{certificate.certificate_id}</CardTitle>
                            <CardDescription>
                              {certificate.total_tonnes} tonnes retired
                            </CardDescription>
                          </div>
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Retired
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium">Beneficiary</p>
                            <p className="text-gray-600">{certificate.beneficiary}</p>
                          </div>
                          <div>
                            <p className="font-medium">Date</p>
                            <p className="text-gray-600">{formatTimestamp(certificate.timestamp)}</p>
                          </div>
                        </div>
                        
                        <div>
                          <p className="font-medium text-sm mb-2">Reason</p>
                          <p className="text-gray-600">{certificate.reason}</p>
                        </div>
                        
                        <div>
                          <p className="font-medium text-sm mb-2">Credits Retired</p>
                          <div className="flex flex-wrap gap-2">
                            {certificate.token_ids.map((tokenId) => (
                              <Badge key={tokenId} variant="outline">
                                #{tokenId}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        <Button variant="outline" className="w-full">
                          <Download className="h-4 w-4 mr-2" />
                          Download Certificate
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="impact" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TreePine className="h-5 w-5 text-green-600" />
                  Total Impact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-3xl font-bold text-green-600">
                    {userCertificates.reduce((sum, cert) => sum + cert.total_tonnes, 0)} tonnes
                  </p>
                  <p className="text-sm text-gray-600">CO2e retired</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  Portfolio Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-3xl font-bold text-blue-600">
                    ${userCredits.length * 15.50}
                  </p>
                  <p className="text-sm text-gray-600">Current market value</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-purple-600" />
                  Contributions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-3xl font-bold text-purple-600">
                    {projects.length}
                  </p>
                  <p className="text-sm text-gray-600">Projects supported</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Environmental Impact Visualization</CardTitle>
              <CardDescription>Your contribution to climate action</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Impact Equivalent</AlertTitle>
                  <AlertDescription>
                    Your retirement of {userCertificates.reduce((sum, cert) => sum + cert.total_tonnes, 0)} tonnes CO2e is equivalent to:
                  </AlertDescription>
                </Alert>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 border rounded">
                    <p className="text-2xl font-bold text-green-600">
                      {(userCertificates.reduce((sum, cert) => sum + cert.total_tonnes, 0) * 2.5).toFixed(1)}
                    </p>
                    <p className="text-sm text-gray-600">Tree seedlings grown for 10 years</p>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <p className="text-2xl font-bold text-blue-600">
                      {(userCertificates.reduce((sum, cert) => sum + cert.total_tonnes, 0) * 5.5).toFixed(1)}
                    </p>
                    <p className="text-sm text-gray-600">Miles not driven by average car</p>
                  </div>
                  <div className="text-center p-4 border rounded">
                    <p className="text-2xl font-bold text-purple-600">
                      {(userCertificates.reduce((sum, cert) => sum + cert.total_tonnes, 0) * 0.8).toFixed(1)}
                    </p>
                    <p className="text-sm text-gray-600">Households powered for a month</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Order Dialog */}
      <Dialog open={showCreateOrder} onOpenChange={setShowCreateOrder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sell Order</DialogTitle>
            <DialogDescription>
              List your carbon credit for sale on the marketplace
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="credit">Select Credit</Label>
              <Select value={selectedCredit?.token_id || ''} onValueChange={(value) => {
                const credit = userCredits.find(c => c.token_id === value);
                setSelectedCredit(credit || null);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a credit to sell" />
                </SelectTrigger>
                <SelectContent>
                  {userCredits.map((credit) => (
                    <SelectItem key={credit.token_id} value={credit.token_id}>
                      Credit #{credit.token_id} - {credit.project_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="price">Price (USDC)</Label>
              <Input
                id="price"
                type="number"
                placeholder="15.50"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="duration">Order Duration (days)</Label>
              <Select value={orderDuration} onValueChange={setOrderDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleCreateOrder} className="flex-1">
                Create Order
              </Button>
              <Button variant="outline" onClick={() => setShowCreateOrder(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retire Credits Dialog */}
      <Dialog open={showRetireCredits} onOpenChange={setShowRetireCredits}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire Carbon Credits</DialogTitle>
            <DialogDescription>
              Permanently retire carbon credits to offset your carbon footprint
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Credits to Retire</Label>
              <div className="space-y-2 mt-2">
                {userCredits.map((credit) => (
                  <div key={credit.token_id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={credit.token_id}
                      checked={selectedCreditsToRetire.includes(credit.token_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCreditsToRetire([...selectedCreditsToRetire, credit.token_id]);
                        } else {
                          setSelectedCreditsToRetire(selectedCreditsToRetire.filter(id => id !== credit.token_id));
                        }
                      }}
                    />
                    <label htmlFor={credit.token_id} className="text-sm">
                      Credit #{credit.token_id} - {credit.project_id} ({credit.amount} tonne)
                    </label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label htmlFor="reason">Retirement Reason</Label>
              <Textarea
                id="reason"
                placeholder="Why are you retiring these credits?"
                value={retirementReason}
                onChange={(e) => setRetirementReason(e.target.value)}
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleRetireCredits} className="flex-1">
                Retire Credits
              </Button>
              <Button variant="outline" onClick={() => setShowRetireCredits(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
