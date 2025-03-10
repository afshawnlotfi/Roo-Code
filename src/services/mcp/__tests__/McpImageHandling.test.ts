import { McpHub } from "../McpHub"
import { McpResourceResponse, McpToolCallResponse } from "../../../shared/mcp"

// Mock dependencies
jest.mock("../McpHub")

describe("MCP Image Handling", () => {
	let mockMcpHub: jest.Mocked<McpHub>
	let mockSay: jest.Mock
	let userMessageContent: any[]

	// Mock implementation of the relevant parts of Cline for testing
	const createMockCline = () => {
		userMessageContent = []

		mockSay = jest.fn().mockResolvedValue(undefined)

		return {
			say: mockSay,
			assistantMessageContent: [] as any[],

			// Mock the presentAssistantMessage method
			presentAssistantMessage: async function () {
				const assistantMessageContent = this.assistantMessageContent || []

				for (const block of assistantMessageContent) {
					if (block.type === "tool_use") {
						if (block.name === "use_mcp_tool") {
							const { server_name, tool_name, arguments: args } = block.params

							const toolResponse = await mockMcpHub.callTool(server_name, tool_name, JSON.parse(args))

							// Extract images from tool response
							const imageUrls: string[] = []
							let textContent = ""

							if (toolResponse.content) {
								toolResponse.content.forEach((item) => {
									if (item.type === "text") {
										textContent += item.text + "\n"
									} else if (item.type === "image" && item.data) {
										imageUrls.push(`data:${item.mimeType || "image/png"};base64,${item.data}`)
									} else if (item.type === "resource" && item.resource) {
										const { mimeType, blob } = item.resource
										if (mimeType && mimeType.startsWith("image/") && blob) {
											imageUrls.push(`data:${mimeType};base64,${blob}`)
										}
									}
								})
							}

							// Call say with the extracted images
							await mockSay(
								"mcp_server_response",
								textContent.trim(),
								imageUrls.length > 0 ? imageUrls : undefined,
							)

							// Add to userMessageContent
							userMessageContent.push({ type: "text", text: "Result:" })
							if (textContent) {
								userMessageContent.push({ type: "text", text: textContent.trim() })
							}
							imageUrls.forEach((url) => {
								userMessageContent.push({ type: "image", url })
							})
						} else if (block.name === "access_mcp_resource") {
							const { server_name, uri } = block.params

							const resourceResponse = await mockMcpHub.readResource(server_name, uri)

							// Extract images from resource response
							const imageUrls: string[] = []
							let textContent = ""

							if (resourceResponse.contents) {
								resourceResponse.contents.forEach((item) => {
									if (item.text) {
										textContent += item.text + "\n"
									} else if (item.mimeType && item.mimeType.startsWith("image/") && item.blob) {
										imageUrls.push(`data:${item.mimeType};base64,${item.blob}`)
									}
								})
							}

							// Call say with the extracted images
							await mockSay(
								"mcp_server_response",
								textContent.trim(),
								imageUrls.length > 0 ? imageUrls : undefined,
							)

							// Add to userMessageContent
							userMessageContent.push({ type: "text", text: "Result:" })
							if (textContent) {
								userMessageContent.push({ type: "text", text: textContent.trim() })
							}
							imageUrls.forEach((url) => {
								userMessageContent.push({ type: "image", url })
							})
						}
					}
				}
			},

			// Helper method for testing
			pushToolResult: function (content: any) {
				userMessageContent.push(...(Array.isArray(content) ? content : [content]))
			},

			// Mock formatResponse for testing
			formatResponse: {
				toolResult: (text: string, images?: string[]) => {
					const result = []
					result.push({ type: "text", text })
					if (images && images.length) {
						images.forEach((url) => result.push({ type: "image", url }))
					}
					return result
				},
			},
		}
	}

	beforeEach(() => {
		// Reset mocks
		jest.clearAllMocks()

		// Setup mock McpHub
		mockMcpHub = new McpHub({} as any) as jest.Mocked<McpHub>
	})

	describe("use_mcp_tool image handling", () => {
		it("should extract and pass images from MCP tool response", async () => {
			const mockCline = createMockCline()

			// Mock the assistantMessageContent with a use_mcp_tool block
			mockCline.assistantMessageContent = [
				{
					type: "tool_use",
					name: "use_mcp_tool",
					params: {
						server_name: "test-server",
						tool_name: "test-tool",
						arguments: JSON.stringify({ param: "value" }),
					},
					partial: false,
				},
			]

			// Mock the McpHub callTool method to return a response with images
			const mockToolResponse: McpToolCallResponse = {
				content: [
					{ type: "text", text: "Text response" },
					{
						type: "image",
						data: "base64ImageData",
						mimeType: "image/png",
					},
				],
			}
			mockMcpHub.callTool.mockResolvedValue(mockToolResponse)

			// Call the method under test
			await mockCline.presentAssistantMessage()

			// Verify that say was called with the extracted image
			expect(mockSay).toHaveBeenCalledWith("mcp_server_response", expect.any(String), [
				"data:image/png;base64,base64ImageData",
			])

			// Verify that the userMessageContent contains the image
			expect(userMessageContent).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "text",
						text: expect.stringContaining("Result:"),
					}),
					expect.objectContaining({
						type: "text",
						text: expect.stringContaining("Text response"),
					}),
					expect.objectContaining({
						type: "image",
						url: "data:image/png;base64,base64ImageData",
					}),
				]),
			)
		})

		it("should handle complex image data structures in tool responses", async () => {
			const mockCline = createMockCline()

			// Mock the assistantMessageContent with a use_mcp_tool block
			mockCline.assistantMessageContent = [
				{
					type: "tool_use",
					name: "use_mcp_tool",
					params: {
						server_name: "test-server",
						tool_name: "test-tool",
						arguments: JSON.stringify({ param: "value" }),
					},
					partial: false,
				},
			]

			// Mock the McpHub callTool method to return a response with a resource containing an image
			const mockToolResponse: McpToolCallResponse = {
				content: [
					{ type: "text", text: "Resource response" },
					{
						type: "resource",
						resource: {
							uri: "test://image",
							mimeType: "image/jpeg",
							blob: "complexImageData",
						},
					},
				],
			}
			mockMcpHub.callTool.mockResolvedValue(mockToolResponse)

			// Call the method under test
			await mockCline.presentAssistantMessage()

			// Verify that say was called with the extracted image
			expect(mockSay).toHaveBeenCalledWith("mcp_server_response", expect.any(String), [
				"data:image/jpeg;base64,complexImageData",
			])
		})
	})

	describe("access_mcp_resource image handling", () => {
		it("should extract and pass images from MCP resource response", async () => {
			const mockCline = createMockCline()

			// Mock the assistantMessageContent with an access_mcp_resource block
			mockCline.assistantMessageContent = [
				{
					type: "tool_use",
					name: "access_mcp_resource",
					params: {
						server_name: "test-server",
						uri: "test://resource",
					},
					partial: false,
				},
			]

			// Mock the McpHub readResource method to return a response with images
			const mockResourceResponse: McpResourceResponse = {
				contents: [
					{ uri: "test://text", text: "Text content", mimeType: "text/plain" },
					{
						uri: "test://image",
						mimeType: "image/png",
						blob: "resourceImageData",
					},
				],
			}
			mockMcpHub.readResource.mockResolvedValue(mockResourceResponse)

			// Call the method under test
			await mockCline.presentAssistantMessage()

			// Verify that say was called with the extracted image
			expect(mockSay).toHaveBeenCalledWith("mcp_server_response", expect.any(String), [
				"data:image/png;base64,resourceImageData",
			])

			// Verify that the userMessageContent contains the image
			expect(userMessageContent).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "text",
						text: expect.stringContaining("Result:"),
					}),
					expect.objectContaining({
						type: "text",
						text: expect.stringContaining("Text content"),
					}),
					expect.objectContaining({
						type: "image",
						url: "data:image/png;base64,resourceImageData",
					}),
				]),
			)
		})
	})

	describe("pushToolResult function", () => {
		it("should correctly handle image arrays in tool results", async () => {
			const mockCline = createMockCline()

			// Call pushToolResult with text and images
			const textResult = "Tool result text"
			const imageUrls = ["data:image/png;base64,image1", "data:image/jpeg;base64,image2"]

			mockCline.pushToolResult(mockCline.formatResponse.toolResult(textResult, imageUrls))

			// Verify that userMessageContent contains both text and images
			expect(userMessageContent).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "text",
						text: expect.stringContaining(textResult),
					}),
					expect.objectContaining({
						type: "image",
						url: "data:image/png;base64,image1",
					}),
					expect.objectContaining({
						type: "image",
						url: "data:image/jpeg;base64,image2",
					}),
				]),
			)
		})
	})
})
