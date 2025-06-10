import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, MapPin, Instagram, Palette } from "lucide-react";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Please enter a valid email address"),
  subject: z.string().max(200, "Subject is too long").optional(),
  message: z.string().min(1, "Message is required").max(1000, "Message is too long"),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function ContactPage() {
  const { toast } = useToast();
  
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
    },
  });

  const contactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      return apiRequest("POST", "/api/contact", data);
    },
    onSuccess: () => {
      toast({
        title: "Message sent successfully!",
        description: "Thank you for your message. I will get back to you soon.",
      });
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: "Please try again or contact me directly via email.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    contactMutation.mutate(data);
  };

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="font-playfair text-4xl md:text-5xl font-semibold text-deep-blue mb-4">
            Get in Touch
          </h1>
          <p className="text-soft-gray text-lg max-w-2xl mx-auto">
            I'd love to hear from you. Whether you're interested in my work, have questions, or want to discuss a commission, please don't hesitate to reach out.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <Card className="shadow-lg">
            <CardContent className="p-8">
              <h2 className="font-playfair text-2xl font-semibold text-deep-blue mb-6">
                Send a Message
              </h2>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-charcoal font-medium">Name *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            className="focus:ring-deep-blue focus:border-deep-blue"
                            placeholder="Your name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-charcoal font-medium">Email *</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="email"
                            className="focus:ring-deep-blue focus:border-deep-blue"
                            placeholder="your@email.com"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-charcoal font-medium">Subject</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            className="focus:ring-deep-blue focus:border-deep-blue"
                            placeholder="What's this about?"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-charcoal font-medium">Message *</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            rows={6}
                            className="focus:ring-deep-blue focus:border-deep-blue resize-vertical"
                            placeholder="Tell me about your interest in my work..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    disabled={contactMutation.isPending}
                    className="w-full bg-deep-blue hover:bg-deep-blue/90 text-white py-3"
                  >
                    {contactMutation.isPending ? "Sending..." : "Send Message"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <div className="space-y-8">
            <Card className="bg-warm-beige shadow-lg">
              <CardContent className="p-8">
                <h2 className="font-playfair text-2xl font-semibold text-deep-blue mb-6">
                  Contact Information
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Mail className="text-deep-blue w-6 h-6 flex-shrink-0" />
                    <div>
                      <p className="text-charcoal font-medium">Email</p>
                      <a 
                        href="mailto:animuradyan.artist@gmail.com" 
                        className="text-deep-blue hover:underline"
                      >
                        animuradyan.artist@gmail.com
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <MapPin className="text-deep-blue w-6 h-6 flex-shrink-0" />
                    <div>
                      <p className="text-charcoal font-medium">Location</p>
                      <p className="text-soft-gray">Yerevan, Armenia</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardContent className="p-8">
                <h2 className="font-playfair text-2xl font-semibold text-deep-blue mb-6">
                  Follow My Work
                </h2>
                <div className="space-y-4">
                  <a 
                    href="https://instagram.com/animuradyan.artist" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 border border-gray-200 rounded hover:border-deep-blue hover:bg-gray-50 transition-all duration-300"
                  >
                    <Instagram className="text-pink-500 w-8 h-8" />
                    <div>
                      <p className="text-charcoal font-medium">Instagram</p>
                      <p className="text-soft-gray text-sm">@animuradyan.artist</p>
                    </div>
                  </a>
                  <a 
                    href="https://saatchiart.com/animuradyan" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 border border-gray-200 rounded hover:border-deep-blue hover:bg-gray-50 transition-all duration-300"
                  >
                    <Palette className="text-deep-blue w-8 h-8" />
                    <div>
                      <p className="text-charcoal font-medium">Saatchi Art</p>
                      <p className="text-soft-gray text-sm">Shop original artworks</p>
                    </div>
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted-pink/20 shadow-lg">
              <CardContent className="p-8">
                <h3 className="font-playfair text-xl font-semibold text-deep-blue mb-4">
                  Commission Work
                </h3>
                <p className="text-soft-gray text-sm mb-4">
                  Interested in commissioning a custom piece? I accept a limited number of commissions each year. Contact me to discuss your vision and timeline.
                </p>
                <ul className="text-soft-gray text-sm space-y-1">
                  <li>• Custom sizes available</li>
                  <li>• 4-8 week completion time</li>
                  <li>• Progress updates provided</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
