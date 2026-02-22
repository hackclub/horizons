<script lang="ts">
	export let markdown: string = '';

	function parseMarkdownToFaq(markdown: string) {
		const lines = markdown.split('\n');
		const faqs: Array<{ id: string; question: string; answer: string }> = [];
		let currentQuestion = '';
		let currentAnswer: string[] = [];

		for (const line of lines) {
			if (line.startsWith('## ')) {
				if (currentQuestion) {
					faqs.push({
						id: currentQuestion.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
						question: currentQuestion,
						answer: currentAnswer.join('\n').trim()
					});
				}
				currentQuestion = line.replace('## ', '').trim();
				currentAnswer = [];
			} else if (currentQuestion && line.trim()) {
				currentAnswer.push(line);
			}
		}

		if (currentQuestion) {
			faqs.push({
				id: currentQuestion.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
				question: currentQuestion,
				answer: currentAnswer.join('\n').trim()
			});
		}

		return faqs;
	}

	function parseMarkdownText(text: string): string {
		return text
			.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="underline hover:opacity-70">$1</a>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\n/g, '<br />');
	}

	$: faqs = parseMarkdownToFaq(markdown);
</script>

<style>
	.faq-item {
		scroll-margin-top: 12rem;
		border-radius: 0.5rem;
		margin: -0.75rem;
		padding: 0.75rem;
	}

	.faq-item:target,
	.faq-item:global(.faq-highlight) {
		animation: highlight 4s ease-out;
	}

	@keyframes highlight {
		0%,
		75% {
			background-color: rgba(0, 0, 0, 0.05);
		}

		100% {
			background-color: transparent;
		}
	}

	a {
		text-decoration: underline;
	}

	a:hover {
		opacity: 0.7;
	}
</style>

<div class="w-full flex flex-col items-center pb-8">
	<div class="max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
		<div class="relative w-full px-6 sm:px-12 md:px-16 py-10 sm:py-12 overflow-visible">
			<div class="relative z-10">
				<div class="max-w-2xl mx-auto space-y-8">
					<h1 class="font-cook text-center text-black tracking-widest" style="font-size: 3rem">FAQ</h1>

					<div class="space-y-8">
						{#each faqs as faq (faq.id)}
							<div id={faq.id} class="faq-item space-y-2">
								<h2 class="text-xl sm:text-2xl font-medium text-black font-cook tracking-wide">
									<a href="#{faq.id}">{faq.question}</a>
								</h2>
								<div class="text-black/70 leading-relaxed">
									{@html parseMarkdownText(faq.answer)}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
