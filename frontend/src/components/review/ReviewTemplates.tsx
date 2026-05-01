"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
    BookOpen,
    CheckCircle,
    Copy,
    Download,
    Edit,
    FileText,
    Plus,
    Search,
    Shield,
    Target,
    Trash2,
    Wrench,
    X,
    Zap
} from "lucide-react";
import React, { useState } from "react";
import { ReviewManager, ReviewTemplate } from "../../lib/review/ReviewManager";

interface ReviewTemplatesProps {
  reviewManager: ReviewManager;
  currentUser: {
    id: string;
    name: string;
  };
  onSelectTemplate?: (template: ReviewTemplate) => void;
  onCreateTemplate?: (template: ReviewTemplate) => void;
}

interface TemplateFormData {
  name: string;
  description: string;
  criteria: {
    name: string;
    description: string;
    weight: number;
    maxScore: number;
  }[];
  defaultComments: string[];
  tags: string[];
}

const DEFAULT_CRITERIA = [
  {
    name: "Security",
    description: "Code security and vulnerability assessment",
    weight: 0.3,
    maxScore: 10,
  },
  {
    name: "Performance",
    description: "Code efficiency and optimization",
    weight: 0.25,
    maxScore: 10,
  },
  {
    name: "Readability",
    description: "Code clarity and documentation",
    weight: 0.25,
    maxScore: 10,
  },
  {
    name: "Maintainability",
    description: "Code structure and modularity",
    weight: 0.2,
    maxScore: 10,
  },
];

const CRITERIA_ICONS = {
  Security: Shield,
  Performance: Zap,
  Readability: BookOpen,
  Maintainability: Wrench,
};

export default function ReviewTemplates({
  reviewManager,
  currentUser,
  onSelectTemplate,
  onCreateTemplate,
}: ReviewTemplatesProps) {
  const [templates, setTemplates] = useState<ReviewTemplate[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReviewTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "created" | "usage">("name");

  const [formData, setFormData] = useState<TemplateFormData>({
    name: "",
    description: "",
    criteria: DEFAULT_CRITERIA,
    defaultComments: [],
    tags: [],
  });

  const [newComment, setNewComment] = useState("");
  const [newTag, setNewTag] = useState("");

  // Load templates
  React.useEffect(() => {
    setTemplates(reviewManager.getAllTemplates());
  }, [reviewManager]);

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTags = selectedTags.length === 0 ||
                       selectedTags.some(tag => template.tags.includes(tag));

    return matchesSearch && matchesTags;
  });

  // Sort templates
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "created":
        return b.id.localeCompare(a.id); // Simple ID-based sort (newer IDs come first)
      case "usage":
        return 0; // Would need usage tracking
      default:
        return 0;
    }
  });

  // Get all unique tags
  const allTags = Array.from(new Set(templates.flatMap(t => t.tags)));

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.description.trim()) {
      return;
    }

    // Validate criteria weights sum to 1
    const totalWeight = formData.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      alert("Criteria weights must sum to 1.0");
      return;
    }

    let savedTemplate: ReviewTemplate;

    if (editingTemplate) {
      // Update existing template
      savedTemplate = reviewManager.updateTemplate(editingTemplate.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        criteria: formData.criteria,
        defaultComments: formData.defaultComments,
        tags: formData.tags,
      })!;
    } else {
      // Create new template
      savedTemplate = reviewManager.createTemplate({
        name: formData.name.trim(),
        description: formData.description.trim(),
        criteria: formData.criteria,
        defaultComments: formData.defaultComments,
        tags: formData.tags,
      });
      onCreateTemplate?.(savedTemplate);
    }

    // Reset form
    setFormData({
      name: "",
      description: "",
      criteria: DEFAULT_CRITERIA,
      defaultComments: [],
      tags: [],
    });
    setShowCreateForm(false);
    setEditingTemplate(null);
    setTemplates(reviewManager.getAllTemplates());
  };

  // Add default comment
  const addComment = () => {
    if (newComment.trim()) {
      setFormData(prev => ({
        ...prev,
        defaultComments: [...prev.defaultComments, newComment.trim()]
      }));
      setNewComment("");
    }
  };

  // Remove default comment
  const removeComment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      defaultComments: prev.defaultComments.filter((_, i) => i !== index)
    }));
  };

  // Add tag
  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  // Remove tag
  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  // Update criterion
  const updateCriterion = (index: number, updates: Partial<typeof DEFAULT_CRITERIA[0]>) => {
    setFormData(prev => ({
      ...prev,
      criteria: prev.criteria.map((criterion, i) =>
        i === index ? { ...criterion, ...updates } : criterion
      )
    }));
  };

  // Add criterion
  const addCriterion = () => {
    setFormData(prev => ({
      ...prev,
      criteria: [...prev.criteria, {
        name: "New Criterion",
        description: "Description of the criterion",
        weight: 0.1,
        maxScore: 10,
      }]
    }));
  };

  // Remove criterion
  const removeCriterion = (index: number) => {
    setFormData(prev => ({
      ...prev,
      criteria: prev.criteria.filter((_, i) => i !== index)
    }));
  };

  // Edit template
  const handleEditTemplate = (template: ReviewTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      criteria: template.criteria,
      defaultComments: template.defaultComments,
      tags: template.tags,
    });
    setShowCreateForm(true);
  };

  // Delete template
  const handleDeleteTemplate = (templateId: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      reviewManager.deleteTemplate(templateId);
      setTemplates(reviewManager.getAllTemplates());
    }
  };

  // Duplicate template
  const handleDuplicateTemplate = (template: ReviewTemplate) => {
    const duplicated = reviewManager.createTemplate({
      name: `${template.name} (Copy)`,
      description: template.description,
      criteria: template.criteria,
      defaultComments: template.defaultComments,
      tags: template.tags,
    });
    setTemplates(reviewManager.getAllTemplates());
  };

  // Export template
  const handleExportTemplate = (template: ReviewTemplate) => {
    const data = JSON.stringify(template, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, "_")}_template.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Review Templates</h2>
          <p className="text-gray-400 mt-1">Create and manage review templates for consistent evaluations</p>
        </div>

        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Template</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 bg-zinc-950 border border-white/10 rounded-lg">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white focus:outline-none focus:border-red-500/60"
          >
            <option value="name">Sort by Name</option>
            <option value="created">Sort by Created</option>
            <option value="usage">Sort by Usage</option>
          </select>
        </div>
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => {
                setSelectedTags(prev =>
                  prev.includes(tag)
                    ? prev.filter(t => t !== tag)
                    : [...prev, tag]
                );
              }}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedTags.includes(tag)
                  ? "bg-red-500 text-white"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedTemplates.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No templates found</p>
            <p className="text-sm mt-2">Create your first review template to get started</p>
          </div>
        ) : (
          sortedTemplates.map((template) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-zinc-950 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{template.name}</h3>
                  <p className="text-sm text-gray-400 line-clamp-2">{template.description}</p>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onSelectTemplate?.(template)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Use template"
                  >
                    <CheckCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Edit template"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDuplicateTemplate(template)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Duplicate template"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleExportTemplate(template)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Export template"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="p-1 text-red-400 hover:text-red-300 transition-colors"
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Criteria Preview */}
              <div className="mb-3">
                <h4 className="text-sm font-medium text-white mb-2">Criteria</h4>
                <div className="space-y-1">
                  {template.criteria.slice(0, 3).map((criterion, index) => {
                    const Icon = CRITERIA_ICONS[criterion.name as keyof typeof CRITERIA_ICONS] || Target;
                    return (
                      <div key={index} className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1">
                          <Icon className="w-3 h-3 text-gray-400" />
                          <span className="text-gray-300">{criterion.name}</span>
                        </div>
                        <span className="text-gray-400">{criterion.maxScore}pts</span>
                      </div>
                    );
                  })}
                  {template.criteria.length > 3 && (
                    <div className="text-xs text-gray-400">
                      +{template.criteria.length - 3} more criteria
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              {template.tags.length > 0 && (
                <div className="mb-3">
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-white/10 text-xs text-gray-300 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Default Comments */}
              {template.defaultComments.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Default Comments</h4>
                  <div className="text-xs text-gray-400">
                    {template.defaultComments.length} pre-defined comment{template.defaultComments.length !== 1 ? 's' : ''}
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Create/Edit Template Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-white/20 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  {editingTemplate ? "Edit Template" : "Create Review Template"}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingTemplate(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Template Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                      placeholder="Enter template name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Description *
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                      placeholder="Describe the template purpose"
                      required
                    />
                  </div>
                </div>

                {/* Criteria */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-white">
                      Evaluation Criteria
                    </label>
                    <button
                      type="button"
                      onClick={addCriterion}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
                    >
                      Add Criterion
                    </button>
                  </div>

                  <div className="space-y-3">
                    {formData.criteria.map((criterion, index) => (
                      <div key={index} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <input
                            type="text"
                            value={criterion.name}
                            onChange={(e) => updateCriterion(index, { name: e.target.value })}
                            className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                            placeholder="Criterion name"
                          />
                          <input
                            type="text"
                            value={criterion.description}
                            onChange={(e) => updateCriterion(index, { description: e.target.value })}
                            className="px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                            placeholder="Description"
                          />
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              value={criterion.weight}
                              onChange={(e) => updateCriterion(index, { weight: parseFloat(e.target.value) })}
                              step="0.1"
                              min="0"
                              max="1"
                              className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                              placeholder="Weight"
                            />
                            <span className="text-sm text-gray-400">
                              {Math.round(criterion.weight * 100)}%
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              value={criterion.maxScore}
                              onChange={(e) => updateCriterion(index, { maxScore: parseInt(e.target.value) })}
                              min="1"
                              max="100"
                              className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                              placeholder="Max Score"
                            />
                            <span className="text-sm text-gray-400">pts</span>
                            <button
                              type="button"
                              onClick={() => removeCriterion(index)}
                              className="p-1 text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 text-xs text-gray-400">
                    Total weight: {Math.round(formData.criteria.reduce((sum, c) => sum + c.weight, 0) * 100)}% (should be 100%)
                  </div>
                </div>

                {/* Default Comments */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Default Comments
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addComment()}
                      className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                      placeholder="Add a default comment..."
                    />
                    <button
                      type="button"
                      onClick={addComment}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formData.defaultComments.map((comment, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                        <span className="text-sm text-gray-300">{comment}</span>
                        <button
                          type="button"
                          onClick={() => removeComment(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Tags
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addTag()}
                      className="flex-1 px-3 py-2 bg-black/50 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-red-500/60"
                      placeholder="Add tags..."
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-white/10 text-sm text-white rounded-full flex items-center space-x-1"
                      >
                        <span>{tag}</span>
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-gray-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setEditingTemplate(null);
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
                  >
                    {editingTemplate ? "Update Template" : "Create Template"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
