import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedbackData {
  rating: number;
  message: string;
}

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackData) => {
      return apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Thank you for your feedback!",
        description: "Your feedback has been submitted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error submitting feedback",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast({
        title: "Please select a rating",
        variant: "destructive",
      });
      return;
    }
    if (!message.trim()) {
      toast({
        title: "Please provide a message",
        variant: "destructive",
      });
      return;
    }
    
    submitFeedbackMutation.mutate({ rating, message: message.trim() });
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsSubmitted(false);
    setRating(0);
    setMessage("");
  };

  const StarRating = () => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          onClick={() => setRating(star)}
          className={`cursor-pointer text-2xl transition-colors ${
            star <= rating ? "text-blue-500" : "text-gray-300"
          } hover:text-blue-400`}
        >
          ★
        </span>
      ))}
    </div>
  );

  return (
    <>
      {/* Feedback Button */}
      <div className="fixed bottom-5 right-5 z-50">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-5 py-3 rounded-lg shadow-lg transition-all duration-200 hover:shadow-xl"
        >
          Give Feedback
        </button>
      </div>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-2xl">
            {isSubmitted ? (
              // Success State
              <div className="text-center p-10">
                <div className="text-green-500 text-4xl mb-4">✓</div>
                <h3 className="text-xl font-semibold text-green-600 dark:text-green-400 mb-3">
                  Thank you for your feedback!
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Your feedback helps us improve your experience.
                </p>
                <button
                  onClick={handleClose}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              // Feedback Form
              <div className="p-8">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  We value your feedback
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Help us improve your experience with Ani's artwork.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Rating */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      How would you rate your experience? *
                    </label>
                    <StarRating />
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Tell us more about your experience *
                    </label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Share your thoughts about the artwork, website experience, or any suggestions..."
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                      rows={4}
                      required
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={submitFeedbackMutation.isPending}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      {submitFeedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 px-6 py-3 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}